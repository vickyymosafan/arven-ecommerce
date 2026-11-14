import { isIP } from 'node:net';
import type { PermissionCode, RoleCode } from '@arven/config';
import { SessionScope } from '@arven/database';

export { SessionScope };

export interface HttpRequestLike {
  method: string;
  url: string;
  originalUrl?: string;
  path?: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  params?: Record<string, string | undefined>;
  socket?: {
    remoteAddress?: string | undefined;
  };
}

export interface CookieOptionsLike {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: boolean | 'lax' | 'strict' | 'none';
  path?: string;
  expires?: Date;
  maxAge?: number;
}

export interface HttpResponseLike {
  cookie(name: string, val: string, options: CookieOptionsLike): unknown;
  clearCookie(name: string, options?: CookieOptionsLike): unknown;
  setHeader(name: string, value: number | string | readonly string[]): unknown;
}

export interface AuthenticatedActor {
  userId: string;
  email: string;
  fullName: string;
  sessionId: string;
  sessionTokenHash: string;
  scope: SessionScope;
  roles: RoleCode[];
  permissions: PermissionCode[];
  mfaEnabled: boolean;
  mfaVerifiedAt: Date | null;
}

export interface ResolvedSession {
  actor: AuthenticatedActor;
  csrfSecret: string;
  expiresAt: Date;
  lastSeenAt: Date;
}

export interface AuditActionMetadata {
  action: string;
  resource: string;
}

export const ARVEN_ACTOR_KEY = Symbol('ARVEN_AUTHENTICATED_ACTOR');
export const ARVEN_RESOLVED_SESSION_KEY = Symbol('ARVEN_RESOLVED_SESSION');
export const ARVEN_SESSION_CACHE_KEY = Symbol('ARVEN_SESSION_CACHE_BY_SCOPE');
export const ARVEN_AUDIT_RECORDED_KEY = Symbol('ARVEN_AUDIT_RECORDED');

export interface AuthenticatedRequest extends HttpRequestLike {
  [ARVEN_ACTOR_KEY]?: AuthenticatedActor;
  [ARVEN_RESOLVED_SESSION_KEY]?: ResolvedSession;
  [ARVEN_SESSION_CACHE_KEY]?: Partial<Record<SessionScope, ResolvedSession | null>>;
  [ARVEN_AUDIT_RECORDED_KEY]?: boolean;
}

export function markAuditRecordedInTransaction(req: HttpRequestLike): void {
  (req as AuthenticatedRequest)[ARVEN_AUDIT_RECORDED_KEY] = true;
}

export function wasAuditRecordedInTransaction(req: HttpRequestLike): boolean {
  return Boolean((req as AuthenticatedRequest)[ARVEN_AUDIT_RECORDED_KEY]);
}

export function parseCookiesFromRequest(req: HttpRequestLike): Record<string, string> {
  const rawHeader = req.headers.cookie;
  if (!rawHeader) {
    return {};
  }

  const headerValue = Array.isArray(rawHeader) ? rawHeader.join('; ') : rawHeader;
  const cookies: Record<string, string> = {};

  for (const segment of headerValue.split(';')) {
    const trimmed = segment.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    if (key.length === 0) {
      continue;
    }
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
  }

  return cookies;
}

function normalizeIpCandidate(raw: string): string | null {
  let candidate = raw.trim();
  if (candidate.length === 0) {
    return null;
  }

  if (candidate.startsWith('::ffff:')) {
    const mappedV4 = candidate.slice('::ffff:'.length);
    if (isIP(mappedV4) === 4) {
      candidate = mappedV4;
    }
  }

  return isIP(candidate) !== 0 ? candidate : null;
}

export function extractClientIp(req: HttpRequestLike): string | null {
  if (typeof req.ip === 'string') {
    const normalizedDirect = normalizeIpCandidate(req.ip);
    if (normalizedDirect) {
      return normalizedDirect;
    }
  }

  const forwarded = req.headers['x-forwarded-for'];
  const firstForwarded = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
      ? forwarded.split(',')[0]
      : undefined;

  if (firstForwarded) {
    const normalizedForwarded = normalizeIpCandidate(firstForwarded);
    if (normalizedForwarded) {
      return normalizedForwarded;
    }
  }

  const remoteAddress = req.socket?.remoteAddress;
  if (typeof remoteAddress === 'string') {
    return normalizeIpCandidate(remoteAddress);
  }

  return null;
}

export function getRequestOrigin(req: HttpRequestLike): string | null {
  const rawOrigin = req.headers.origin;
  const originCandidate = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
  if (typeof originCandidate === 'string' && originCandidate.trim().length > 0) {
    try {
      const parsed = new URL(originCandidate.trim());
      if (parsed.origin !== 'null') {
        return parsed.origin;
      }
    } catch {
      return null;
    }
  }

  const rawReferer = req.headers.referer;
  const refererCandidate = Array.isArray(rawReferer) ? rawReferer[0] : rawReferer;
  if (typeof refererCandidate === 'string' && refererCandidate.trim().length > 0) {
    try {
      const parsed = new URL(refererCandidate.trim());
      if (parsed.origin !== 'null') {
        return parsed.origin;
      }
    } catch {
      return null;
    }
  }

  return null;
}
