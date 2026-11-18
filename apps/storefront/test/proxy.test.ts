import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { proxy } from '../src/proxy.js';
import { sanitizeRedirectPath } from '../src/lib/redirect.js';

describe('Storefront proxy and redirect sanitization', () => {
  const originalApiUrl = process.env['API_URL'];

  afterEach(() => {
    if (originalApiUrl === undefined) {
      delete process.env['API_URL'];
    } else {
      process.env['API_URL'] = originalApiUrl;
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
});
