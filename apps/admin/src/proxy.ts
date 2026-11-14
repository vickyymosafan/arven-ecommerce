import { NextResponse, type NextRequest } from 'next/server';
import { sanitizeRedirectPath } from './lib/redirect';

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function buildContentSecurityPolicy(nonce: string, isHttps: boolean): string {
  const isDev = process.env['NODE_ENV'] === 'development';
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (isHttps) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
}

function hasAdminSessionCookie(request: NextRequest): boolean {
  const configuredName = process.env['ADMIN_SESSION_COOKIE_NAME'];
  const candidates = configuredName
    ? [configuredName, '__Host-arven_admin_sid', 'arven_admin_sid']
    : ['__Host-arven_admin_sid', 'arven_admin_sid'];

  return candidates.some((name) => {
    const value = request.cookies.get(name)?.value;
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function applySecurityHeaders(response: NextResponse, csp: string): NextResponse {
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Same-origin BFF rewrite for /api/v1/* with explicit admin portal provenance header
  if (pathname === '/api/v1' || pathname.startsWith('/api/v1/')) {
    const apiBase = (process.env['API_URL'] ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
    const targetUrl = new URL(`${pathname}${search}`, apiBase);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-arven-portal', 'admin');

    return NextResponse.rewrite(targetUrl, {
      request: {
        headers: requestHeaders,
      },
    });
  }

  if (pathname === '/mfa') {
    const redirectUrl = new URL(`/mfa/verify${search}`, request.url);
    return NextResponse.redirect(redirectUrl, 307);
  }

  // Optimistic admin cookie gate for all operations and MFA routes except /login
  if (pathname !== '/login') {
    if (!hasAdminSessionCookie(request)) {
      const safeNext = sanitizeRedirectPath(`${pathname}${search}`, '/');
      const loginUrl = new URL('/login', request.url);
      if (safeNext !== '/') {
        loginUrl.searchParams.set('next', safeNext);
      }
      return NextResponse.redirect(loginUrl, 307);
    }
  }

  const nonce = generateNonce();
  const isHttps =
    request.nextUrl.protocol === 'https:' ||
    request.headers.get('x-forwarded-proto') === 'https';
  const csp = buildContentSecurityPolicy(nonce, isHttps);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  return applySecurityHeaders(response, csp);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2|wasm)$).*)',
  ],
};
