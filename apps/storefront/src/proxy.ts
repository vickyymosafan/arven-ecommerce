import { NextResponse, type NextRequest } from 'next/server';
import { sanitizeRedirectPath } from './lib/redirect';

const COMPAT_AUTH_REDIRECTS: Record<string, string> = {
  '/login': '/auth/login',
  '/register': '/auth/register',
  '/verify-email': '/auth/verify-email',
  '/forgot-password': '/auth/forgot-password',
  '/reset-password': '/auth/reset-password',
};

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

// Pre-rendered Next.js 16 cacheComponents shells emit fixed runtime timing & Fizz Suspense boundary markers without per-request nonces.
const NEXT_CACHE_COMPONENTS_INLINE_HASHES = [
  "'sha256-7mu4H06fwDCjmnxxr/xNHyuQC6pLTHr4M2E4jXw5WZs='",
  "'sha256-kyaKBybsHvqmdq5RcfhCZ+crfD0hW2GQeUy0Bp1fWNg='",
  "'sha256-ot4uWMULOgQERJVeW+1RS4LiQazeh9VYa+IzbwCX43U='",
  "'sha256-D9S5KXsSSajKKVF3Jf+B22EHGKgFWMmaLff5rY6FNZc='",
].join(' ');

function buildContentSecurityPolicy(nonce: string, isHttps: boolean): string {
  const isDev = process.env['NODE_ENV'] === 'development';
  // Avoid 'strict-dynamic' so 'self' remains active for pre-rendered /_next/static/chunks scripts in cacheComponents shells.
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' ${NEXT_CACHE_COMPONENTS_INLINE_HASHES} 'wasm-unsafe-eval' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' ${NEXT_CACHE_COMPONENTS_INLINE_HASHES} 'wasm-unsafe-eval'`;
  const connectSrc = isDev
    ? "'self' ws://127.0.0.1:* ws://localhost:*"
    : "'self'";

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "worker-src 'self' blob:",
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

function hasCustomerSessionCookie(request: NextRequest): boolean {
  const configuredName = process.env['CUSTOMER_SESSION_COOKIE_NAME'];
  const candidates = configuredName
    ? [configuredName, '__Host-arven_sid', 'arven_sid']
    : ['__Host-arven_sid', 'arven_sid'];

  return candidates.some((name) => {
    const value = request.cookies.get(name)?.value;
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function applySecurityHeaders(
  response: NextResponse,
  csp: string,
): NextResponse {
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Same-origin BFF rewrite for /api/v1/* with explicit customer portal provenance header
  if (pathname === '/api/v1' || pathname.startsWith('/api/v1/')) {
    const apiBase = (process.env['API_URL'] ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
    const targetUrl = new URL(`${pathname}${search}`, apiBase);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-arven-portal', 'customer');

    return NextResponse.rewrite(targetUrl, {
      request: {
        headers: requestHeaders,
      },
    });
  }

  const nonce = generateNonce();
  const isHttps =
    request.nextUrl.protocol === 'https:' ||
    request.headers.get('x-forwarded-proto') === 'https';
  const csp = buildContentSecurityPolicy(nonce, isHttps);

  // Canonicalize legacy top-level auth URLs to /auth/*
  const compatTarget = COMPAT_AUTH_REDIRECTS[pathname];
  if (compatTarget) {
    const redirectUrl = new URL(`${compatTarget}${search}`, request.url);
    return applySecurityHeaders(NextResponse.redirect(redirectUrl, 307), csp);
  }

  // Optimistic session cookie pre-check on protected customer account routes
  if (pathname === '/account' || pathname.startsWith('/account/')) {
    if (!hasCustomerSessionCookie(request)) {
      const safeNext = sanitizeRedirectPath(`${pathname}${search}`, '/account');
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('next', safeNext);
      return applySecurityHeaders(NextResponse.redirect(loginUrl, 307), csp);
    }
  }

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
    '/((?!_next/static|_next/image|_next/hmr|_next/webpack-hmr|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2|wasm)$).*)',
  ],
};
