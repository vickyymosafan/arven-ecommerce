import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { config, proxy } from '../src/proxy.js';
import { sanitizeRedirectPath } from '../src/lib/redirect.js';

describe('Storefront proxy and redirect sanitization', () => {
  const originalApiUrl = process.env['API_URL'];
  const originalNodeEnv = process.env['NODE_ENV'];

  afterEach(() => {
    if (originalApiUrl === undefined) {
      delete process.env['API_URL'];
    } else {
      process.env['API_URL'] = originalApiUrl;
    }
    if (originalNodeEnv === undefined) {
      delete (process.env as Record<string, string | undefined>)['NODE_ENV'];
    } else {
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = originalNodeEnv;
    }
  });

  it('rewrites /api/v1/* with x-arven-portal: customer header', () => {
    process.env['API_URL'] = 'http://127.0.0.1:4000';
    const request = new NextRequest('http://127.0.0.1:3000/api/v1/auth/me?include=profile');

    const response = proxy(request);

    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://127.0.0.1:4000/api/v1/auth/me?include=profile',
    );
    const overriddenHeaders = response.headers.get('x-middleware-override-headers') ?? '';
    expect(overriddenHeaders).toContain('x-arven-portal');
    expect(response.headers.get('x-middleware-request-x-arven-portal')).toBe('customer');
  });

  it('redirects unauthenticated /account requests to /auth/login with safe next param', () => {
    const request = new NextRequest('http://127.0.0.1:3000/account/addresses?tab=default');

    const response = proxy(request);

    expect(response.status).toBe(307);
    const location = response.headers.get('location') ?? '';
    const parsed = new URL(location);
    expect(parsed.pathname).toBe('/auth/login');
    expect(parsed.searchParams.get('next')).toBe('/account/addresses?tab=default');
  });

  it('allows authenticated /account requests and attaches CSP nonce + security headers', () => {
    const request = new NextRequest('http://127.0.0.1:3000/account', {
      headers: {
        cookie: 'arven_sid=test-session-token',
      },
    });

    const response = proxy(request);

    expect(response.status).toBe(200);
    const csp = response.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("'sha256-7mu4H06fwDCjmnxxr/xNHyuQC6pLTHr4M2E4jXw5WZs='");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).not.toContain("'strict-dynamic'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain('upgrade-insecure-requests');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('Permissions-Policy')).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
    expect(response.headers.get('x-middleware-request-x-nonce')).toBeTruthy();
  });

  it('adds upgrade-insecure-requests only on HTTPS requests and canonicalizes legacy auth paths', () => {
    const httpsReq = new NextRequest('https://arven.id/', {
      headers: { 'x-forwarded-proto': 'https' },
    });
    const httpsRes = proxy(httpsReq);
    expect(httpsRes.headers.get('Content-Security-Policy')).toContain('upgrade-insecure-requests');

    const legacyReq = new NextRequest('http://127.0.0.1:3000/login?verified=1');
    const legacyRes = proxy(legacyReq);
    expect(legacyRes.status).toBe(307);
    expect(new URL(legacyRes.headers.get('location') ?? '').pathname).toBe('/auth/login');
    expect(new URL(legacyRes.headers.get('location') ?? '').search).toBe('?verified=1');
  });

  it('blocks external and protocol-relative redirect targets', () => {
    expect(sanitizeRedirectPath('//evil.test/steal')).toBe('/account');
    expect(sanitizeRedirectPath('https://evil.test/login')).toBe('/account');
    expect(sanitizeRedirectPath('/\\evil.test')).toBe('/account');
    expect(sanitizeRedirectPath('/account/sessions?view=active')).toBe(
      '/account/sessions?view=active',
    );
  });

  it('enforces production CSP (wasm-unsafe-eval without unsafe-eval, worker-src blob, zero CDNs) on Phase 08 routes', () => {
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';

    for (const route of ['/showroom', '/outfit-studio']) {
      const res = proxy(new NextRequest(`https://arven.id${route}`, {
        headers: { 'x-forwarded-proto': 'https' },
      }));
      expect(res.status).toBe(200);
      const csp = res.headers.get('Content-Security-Policy') ?? '';
      expect(csp).toContain("script-src 'self' 'nonce-");
      expect(csp).toContain("'wasm-unsafe-eval'");
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).toContain("worker-src 'self' blob:");
      expect(csp).toContain("img-src 'self' data: blob:");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).not.toMatch(/https?:\/\/|unpkg\.com|gstatic\.com|jsdelivr|cdnjs/i);
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    }
  });

  it('protects /account/outfits with session cookie gate and proxies Phase 08 /api/v1/* endpoints', () => {
    const unauthOutfits = proxy(new NextRequest('http://127.0.0.1:3000/account/outfits?sort=recent'));
    expect(unauthOutfits.status).toBe(307);
    const loginRedirect = new URL(unauthOutfits.headers.get('location') ?? '');
    expect(loginRedirect.pathname).toBe('/auth/login');
    expect(loginRedirect.searchParams.get('next')).toBe('/account/outfits?sort=recent');

    const authOutfits = proxy(
      new NextRequest('http://127.0.0.1:3000/account/outfits', {
        headers: { cookie: '__Host-arven_sid=valid-customer-sid' },
      }),
    );
    expect(authOutfits.status).toBe(200);
    expect(authOutfits.headers.get('Content-Security-Policy')).toContain("'wasm-unsafe-eval'");

    process.env['API_URL'] = 'http://127.0.0.1:4000';
    for (const apiPath of [
      '/api/v1/showroom/scenes',
      '/api/v1/showroom/zones/atrium-entrance/poster',
      '/api/v1/outfit-studio/catalog',
      '/api/v1/outfit-scenes',
    ]) {
      const apiRes = proxy(
        new NextRequest(`http://127.0.0.1:3000${apiPath}`, {
          headers: { cookie: 'arven_sid=test-session-token' },
        }),
      );
      expect(apiRes.headers.get('x-middleware-rewrite')).toBe(`http://127.0.0.1:4000${apiPath}`);
      expect(apiRes.headers.get('x-middleware-request-x-arven-portal')).toBe('customer');
    }
  });

  it('matches Phase 08 storefront routes and API paths in proxy config.matcher while excluding static wasm', () => {
    const matcherRegex = new RegExp(`^${config.matcher[0]}$`);
    expect(matcherRegex.test('/showroom')).toBe(true);
    expect(matcherRegex.test('/outfit-studio')).toBe(true);
    expect(matcherRegex.test('/account/outfits')).toBe(true);
    expect(matcherRegex.test('/api/v1/showroom/scenes')).toBe(true);
    expect(matcherRegex.test('/api/v1/showroom/zones/atrium/poster')).toBe(true);
    expect(matcherRegex.test('/api/v1/outfit-scenes')).toBe(true);
    expect(matcherRegex.test('/decoders/draco_decoder.wasm')).toBe(false);
    expect(matcherRegex.test('/_next/static/chunks/showroom.js')).toBe(false);
  });
});
