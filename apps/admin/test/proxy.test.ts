import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { config, proxy } from '../src/proxy';
import { sanitizeRedirectPath } from '../src/lib/redirect';

describe('Admin proxy and redirect sanitization', () => {
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

  it('rewrites /api/v1/* with x-arven-portal: admin header', () => {
    process.env['API_URL'] = 'http://127.0.0.1:4000';
    const request = new NextRequest('http://127.0.0.1:3001/api/v1/admin/users?page=1');

    const response = proxy(request);

    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://127.0.0.1:4000/api/v1/admin/users?page=1',
    );
    expect(response.headers.get('x-middleware-override-headers') ?? '').toContain(
      'x-arven-portal',
    );
    expect(response.headers.get('x-middleware-request-x-arven-portal')).toBe('admin');
  });

  it('redirects unauthenticated protected admin routes to /login', () => {
    const request = new NextRequest('http://127.0.0.1:3001/roles');
    const response = proxy(request);

    expect(response.status).toBe(307);
    const parsed = new URL(response.headers.get('location') ?? '');
    expect(parsed.pathname).toBe('/login');
    expect(parsed.searchParams.get('next')).toBe('/roles');
  });

  it('allows /login without admin cookie and attaches CSP nonce + security headers', () => {
    const request = new NextRequest('http://127.0.0.1:3001/login');
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
    expect(response.headers.get('x-middleware-request-x-nonce')).toBeTruthy();
  });

  it('canonicalizes /mfa to /mfa/verify and blocks external redirect targets', () => {
    const mfaReq = new NextRequest('http://127.0.0.1:3001/mfa?reason=step-up');
    const mfaRes = proxy(mfaReq);
    expect(mfaRes.status).toBe(307);
    expect(new URL(mfaRes.headers.get('location') ?? '').pathname).toBe('/mfa/verify');

    expect(sanitizeRedirectPath('//evil.test')).toBe('/');
    expect(sanitizeRedirectPath('https://evil.test/login')).toBe('/');
    expect(sanitizeRedirectPath('/audit-logs?action=ROLE_UPDATED')).toBe(
      '/audit-logs?action=ROLE_UPDATED',
    );
  });

  it('gates /experience/* behind admin session cookie and enforces production 3D CSP without unsafe-eval or CDNs', () => {
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';

    for (const route of ['/experience/showroom', '/experience/outfit-studio']) {
      const unauthRes = proxy(new NextRequest(`https://admin.arven.id${route}`));
      expect(unauthRes.status).toBe(307);
      const parsed = new URL(unauthRes.headers.get('location') ?? '');
      expect(parsed.pathname).toBe('/login');
      expect(parsed.searchParams.get('next')).toBe(route);

      const authRes = proxy(
        new NextRequest(`https://admin.arven.id${route}`, {
          headers: {
            cookie: '__Host-arven_admin_sid=valid-admin-sid',
            'x-forwarded-proto': 'https',
          },
        }),
      );
      expect(authRes.status).toBe(200);
      const csp = authRes.headers.get('Content-Security-Policy') ?? '';
      expect(csp).toContain("script-src 'self' 'nonce-");
      expect(csp).toContain("'wasm-unsafe-eval'");
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).toContain("worker-src 'self' blob:");
      expect(csp).toContain("img-src 'self' data: blob:");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).not.toMatch(/https?:\/\/|unpkg\.com|gstatic\.com|jsdelivr|cdnjs/i);
      expect(authRes.headers.get('X-Frame-Options')).toBe('DENY');
      expect(authRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(authRes.headers.get('x-middleware-request-x-nonce')).toBeTruthy();
    }
  });

  it('proxies Phase 08 admin /api/v1/* endpoints and matches /experience/* in config.matcher', () => {
    process.env['API_URL'] = 'http://127.0.0.1:4000';
    for (const apiPath of [
      '/api/v1/admin/showroom/zones',
      '/api/v1/admin/outfit-studio/garments',
      '/api/v1/admin/outfit-studio/presets',
    ]) {
      const res = proxy(new NextRequest(`http://127.0.0.1:3001${apiPath}`));
      expect(res.headers.get('x-middleware-rewrite')).toBe(`http://127.0.0.1:4000${apiPath}`);
      expect(res.headers.get('x-middleware-request-x-arven-portal')).toBe('admin');
    }

    const matcherRegex = new RegExp(`^${config.matcher[0]}$`);
    expect(matcherRegex.test('/experience/showroom')).toBe(true);
    expect(matcherRegex.test('/experience/outfit-studio')).toBe(true);
    expect(matcherRegex.test('/api/v1/admin/showroom/zones')).toBe(true);
    expect(matcherRegex.test('/decoders/draco_decoder.wasm')).toBe(false);
    expect(matcherRegex.test('/_next/static/chunks/experience.js')).toBe(false);
  });
});
