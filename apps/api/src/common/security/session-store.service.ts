import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import {
  ADMIN_ROLE_CODES,
  AUTH_POLICY,
  CSRF_COOKIE_NAME,
  CSRF_PROD_COOKIE_NAME,
  HTTP_HEADERS,
  type PermissionCode,
  type RoleCode,
} from '@arven/config';
import {
  SessionScope,
  UserStatus,
  type PrismaTransactionClient,
} from '@arven/database';
import { RUNTIME_CONFIG } from '../../shared/config/config.module.js';
import type { RuntimeConfig } from '@arven/config';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../shared/redis/redis.module.js';
import { TokenCryptoService } from './token-crypto.service.js';
import {
  ARVEN_SESSION_CACHE_KEY,
  parseCookiesFromRequest,
  type AuthenticatedActor,
  type AuthenticatedRequest,
  type HttpRequestLike,
  type HttpResponseLike,
  type ResolvedSession,
} from './types.js';

const SESSION_CACHE_PREFIX = 'session:sha256:';
const ROLE_CODE_SET = new Set<string>(ADMIN_ROLE_CODES.concat(['CUSTOMER'] as never[]));
const ADMIN_ROLE_SET = new Set<string>(ADMIN_ROLE_CODES);

interface CachedSessionSnapshot {
  userId: string;
  email: string;
  fullName: string;
  userStatus: UserStatus;
  mfaEnabled: boolean;
  sessionId: string;
  sessionTokenHash: string;
  scope: SessionScope;
  csrfSecret: string;
  mfaVerifiedAt: string | null;
  roles: RoleCode[];
  permissions: PermissionCode[];
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface CreateSessionInput {
  userId: string;
  scope: SessionScope;
  ipAddress: string | null;
  userAgent: string | null;
  mfaVerifiedAt?: Date | null;
  tx?: PrismaTransactionClient;
}

export interface CreatedSessionResult {
  rawToken: string;
  tokenHash: string;
  sessionId: string;
  csrfSecret: string;
  csrfToken: string;
  expiresAt: Date;
}

function tryExtractOrigin(urlString: string): string | null {
  try {
    return new URL(urlString).origin;
  } catch {
    return null;
  }
}

@Injectable()
export class SessionStoreService {
  private readonly appOrigin: string | null;
  private readonly adminOrigin: string | null;

  constructor(
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(TokenCryptoService) private readonly tokenCrypto: TokenCryptoService,
  ) {
    this.appOrigin = tryExtractOrigin(config.APP_URL);
    this.adminOrigin = tryExtractOrigin(config.ADMIN_URL);
  }

  getCookieName(scope: SessionScope): string {
    return scope === SessionScope.ADMIN
      ? this.config.ADMIN_SESSION_COOKIE
      : this.config.STOREFRONT_SESSION_COOKIE;
  }

  getPreAuthCsrfCookieName(): string {
    return this.config.COOKIE_SECURE ? CSRF_PROD_COOKIE_NAME : CSRF_COOKIE_NAME;
  }

  setSessionCookie(
    res: HttpResponseLike,
    scope: SessionScope,
    rawToken: string,
    expiresAt: Date,
  ): void {
    res.cookie(this.getCookieName(scope), rawToken, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: scope === SessionScope.ADMIN ? 'strict' : 'lax',
      path: '/',
      expires: expiresAt,
    });
  }

  clearSessionCookie(res: HttpResponseLike, scope: SessionScope): void {
    res.clearCookie(this.getCookieName(scope), {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: scope === SessionScope.ADMIN ? 'strict' : 'lax',
      path: '/',
    });
  }

  setPreAuthCsrfCookie(
    res: HttpResponseLike,
    cookieValue: string,
    maxAgeMs: number,
  ): void {
    res.cookie(this.getPreAuthCsrfCookieName(), cookieValue, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeMs,
    });
  }

  private getIdleTimeoutMs(scope: SessionScope): number {
    return scope === SessionScope.ADMIN
      ? AUTH_POLICY.ADMIN_IDLE_TIMEOUT_MINUTES * 60 * 1000
      : AUTH_POLICY.CUSTOMER_SESSION_TTL_HOURS * 60 * 60 * 1000;
  }

  private getAbsoluteTimeoutMs(scope: SessionScope): number {
    return scope === SessionScope.ADMIN
      ? AUTH_POLICY.ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000
      : AUTH_POLICY.CUSTOMER_ABSOLUTE_TTL_DAYS * 24 * 60 * 60 * 1000;
  }

  private computeExpiresAt(scope: SessionScope, now: Date, createdAt: Date): Date {
    const idleExpiryMs = now.getTime() + this.getIdleTimeoutMs(scope);
    const absoluteExpiryMs = createdAt.getTime() + this.getAbsoluteTimeoutMs(scope);
    return new Date(Math.min(idleExpiryMs, absoluteExpiryMs));
  }

  private isSessionTimeValid(
    scope: SessionScope,
    createdAt: Date,
    lastSeenAt: Date,
    expiresAt: Date,
    now: Date,
  ): boolean {
    const nowMs = now.getTime();
    if (nowMs >= expiresAt.getTime()) {
      return false;
    }
    if (nowMs - createdAt.getTime() >= this.getAbsoluteTimeoutMs(scope)) {
      return false;
    }
    if (nowMs - lastSeenAt.getTime() > this.getIdleTimeoutMs(scope)) {
      return false;
    }
    return true;
  }

  private resolveTargetScopes(
    req: HttpRequestLike,
    allowedScopes: readonly SessionScope[],
    cookies: Record<string, string>,
  ): SessionScope[] {
    if (allowedScopes.length === 1) {
      return [allowedScopes[0] as SessionScope];
    }

    const portalHeaderRaw = req.headers[HTTP_HEADERS.PORTAL];
    const portalHeader = (
      Array.isArray(portalHeaderRaw) ? portalHeaderRaw[0] : portalHeaderRaw
    )
      ?.trim()
      .toLowerCase();

    if (portalHeader === 'admin') {
      return allowedScopes.includes(SessionScope.ADMIN) ? [SessionScope.ADMIN] : [];
    }
    if (portalHeader === 'customer') {
      return allowedScopes.includes(SessionScope.CUSTOMER) ? [SessionScope.CUSTOMER] : [];
    }

    const originHeaderRaw = req.headers.origin;
    const originHeader = Array.isArray(originHeaderRaw)
      ? originHeaderRaw[0]
      : originHeaderRaw;
    let requestOrigin: string | null = originHeader
      ? tryExtractOrigin(originHeader)
      : null;
    if (!requestOrigin && typeof req.headers.referer === 'string') {
      requestOrigin = tryExtractOrigin(req.headers.referer);
    }

    if (
      requestOrigin &&
      this.adminOrigin &&
      requestOrigin === this.adminOrigin &&
      this.adminOrigin !== this.appOrigin
    ) {
      return allowedScopes.includes(SessionScope.ADMIN) ? [SessionScope.ADMIN] : [];
    }
    if (
      requestOrigin &&
      this.appOrigin &&
      requestOrigin === this.appOrigin &&
      this.appOrigin !== this.adminOrigin
    ) {
      return allowedScopes.includes(SessionScope.CUSTOMER) ? [SessionScope.CUSTOMER] : [];
    }

    // Ambiguous host (e.g. localhost proxy or direct client without portal header):
    // If an admin cookie is present, evaluate strictly as ADMIN without falling back to CUSTOMER.
    const adminCookie = cookies[this.config.ADMIN_SESSION_COOKIE];
    if (adminCookie && allowedScopes.includes(SessionScope.ADMIN)) {
      return [SessionScope.ADMIN];
    }

    const customerCookie = cookies[this.config.STOREFRONT_SESSION_COOKIE];
    if (customerCookie && allowedScopes.includes(SessionScope.CUSTOMER)) {
      return [SessionScope.CUSTOMER];
    }

    return [];
  }

  private getRequestScopeCache(
    req: HttpRequestLike,
  ): Partial<Record<SessionScope, ResolvedSession | null>> {
    const typedReq = req as AuthenticatedRequest;
    if (!typedReq[ARVEN_SESSION_CACHE_KEY]) {
      typedReq[ARVEN_SESSION_CACHE_KEY] = {};
    }
    return typedReq[ARVEN_SESSION_CACHE_KEY];
  }

  async createSession(input: CreateSessionInput): Promise<CreatedSessionResult> {
    const rawToken = this.tokenCrypto.generateOpaqueToken(32);
    const tokenHash = this.tokenCrypto.sha256Hex(rawToken);
    const csrfSecret = this.tokenCrypto.createSessionCsrfSecret();
    const now = new Date();
    const expiresAt = this.computeExpiresAt(input.scope, now, now);
    const db = input.tx ?? this.prisma.client;

    const session = await db.session.create({
      data: {
        userId: input.userId,
        scope: input.scope,
        tokenHash,
        csrfSecret,
        mfaVerifiedAt: input.mfaVerifiedAt ?? null,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent ? input.userAgent.slice(0, 512) : null,
        expiresAt,
        createdAt: now,
        lastSeenAt: now,
      },
      select: {
        id: true,
      },
    });

    return {
      rawToken,
      tokenHash,
      sessionId: session.id,
      csrfSecret,
      csrfToken: this.tokenCrypto.deriveSessionCsrfToken(csrfSecret),
      expiresAt,
    };
  }

  async resolveFromRequest(
    req: HttpRequestLike,
    allowedScopes: readonly SessionScope[],
  ): Promise<ResolvedSession | null> {
    const cookies = parseCookiesFromRequest(req);
    const targetScopes = this.resolveTargetScopes(req, allowedScopes, cookies);
    if (targetScopes.length === 0) {
      return null;
    }

    const requestCache = this.getRequestScopeCache(req);

    for (const scope of targetScopes) {
      if (Object.prototype.hasOwnProperty.call(requestCache, scope)) {
        const cachedForRequest = requestCache[scope];
        if (cachedForRequest) {
          return cachedForRequest;
        }
        continue;
      }

      const rawToken = cookies[this.getCookieName(scope)];
      if (!rawToken || rawToken.length < 16 || rawToken.length > 256) {
        requestCache[scope] = null;
        continue;
      }

      const tokenHash = this.tokenCrypto.sha256Hex(rawToken);
      const resolved = await this.resolveTokenHash(tokenHash, scope);
      requestCache[scope] = resolved;
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  private snapshotToResolvedSession(snapshot: CachedSessionSnapshot): ResolvedSession {
    const actor: AuthenticatedActor = {
      userId: snapshot.userId,
      email: snapshot.email,
      fullName: snapshot.fullName,
      sessionId: snapshot.sessionId,
      sessionTokenHash: snapshot.sessionTokenHash,
      scope: snapshot.scope,
      roles: snapshot.roles,
      permissions: snapshot.permissions,
      mfaEnabled: snapshot.mfaEnabled,
      mfaVerifiedAt: snapshot.mfaVerifiedAt ? new Date(snapshot.mfaVerifiedAt) : null,
    };

    return {
      actor,
      csrfSecret: snapshot.csrfSecret,
      expiresAt: new Date(snapshot.expiresAt),
      lastSeenAt: new Date(snapshot.lastSeenAt),
    };
  }

  private async cacheSnapshot(snapshot: CachedSessionSnapshot): Promise<void> {
    const now = Date.now();
    const idleRemainingSec = Math.floor(
      (new Date(snapshot.lastSeenAt).getTime() + this.getIdleTimeoutMs(snapshot.scope) - now) /
        1000,
    );
    const expiresRemainingSec = Math.floor(
      (new Date(snapshot.expiresAt).getTime() - now) / 1000,
    );
    const ttlSeconds = Math.min(idleRemainingSec, expiresRemainingSec, 3600);
    if (ttlSeconds <= 0) {
      return;
    }

    try {
      await this.redis.set(
        `${SESSION_CACHE_PREFIX}${snapshot.sessionTokenHash}`,
        JSON.stringify(snapshot),
        'EX',
        ttlSeconds,
      );
    } catch {
      // Cache write failure is non-fatal; DB remains source of truth.
    }
  }

  private async resolveTokenHash(
    tokenHash: string,
    expectedScope: SessionScope,
  ): Promise<ResolvedSession | null> {
    const cacheKey = `${SESSION_CACHE_PREFIX}${tokenHash}`;
    const now = new Date();

    try {
      const cachedRaw = await this.redis.get(cacheKey);
      if (cachedRaw) {
        const snapshot = JSON.parse(cachedRaw) as CachedSessionSnapshot;
        if (
          snapshot.scope === expectedScope &&
          snapshot.userStatus === UserStatus.ACTIVE &&
          this.isSessionTimeValid(
            snapshot.scope,
            new Date(snapshot.createdAt),
            new Date(snapshot.lastSeenAt),
            new Date(snapshot.expiresAt),
            now,
          )
        ) {
          if (
            snapshot.scope === SessionScope.ADMIN &&
            !snapshot.roles.some((role) => ADMIN_ROLE_SET.has(role))
          ) {
            await this.invalidateTokenCache(tokenHash);
            return null;
          }
          await this.touchActivityIfStale(snapshot, now);
          return this.snapshotToResolvedSession(snapshot);
        }

        await this.invalidateTokenCache(tokenHash);
      }
    } catch {
      // Fall through to authoritative PostgreSQL lookup on cache error/malformed entry.
    }

    const dbSession = await this.prisma.client.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            userRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!dbSession || dbSession.revokedAt !== null || dbSession.scope !== expectedScope) {
      return null;
    }

    if (
      !this.isSessionTimeValid(
        dbSession.scope,
        dbSession.createdAt,
        dbSession.lastSeenAt,
        dbSession.expiresAt,
        now,
      )
    ) {
      return null;
    }

    if (dbSession.user.status !== UserStatus.ACTIVE) {
      return null;
    }

    const roles: RoleCode[] = [];
    const permissionSet = new Set<PermissionCode>();

    for (const userRole of dbSession.user.userRoles) {
      const roleCode = userRole.role.code;
      if (ROLE_CODE_SET.has(roleCode)) {
        roles.push(roleCode as RoleCode);
      }
      for (const rp of userRole.role.rolePermissions) {
        permissionSet.add(rp.permission.code as PermissionCode);
      }
    }

    if (
      dbSession.scope === SessionScope.ADMIN &&
      !roles.some((role) => ADMIN_ROLE_SET.has(role))
    ) {
      return null;
    }

    let effectiveLastSeenAt = dbSession.lastSeenAt;
    let effectiveExpiresAt = dbSession.expiresAt;

    if (now.getTime() - dbSession.lastSeenAt.getTime() >= 60_000) {
      effectiveLastSeenAt = now;
      effectiveExpiresAt = this.computeExpiresAt(dbSession.scope, now, dbSession.createdAt);
      await this.prisma.client.session
        .updateMany({
          where: { id: dbSession.id, revokedAt: null },
          data: {
            lastSeenAt: effectiveLastSeenAt,
            expiresAt: effectiveExpiresAt,
          },
        })
        .catch(() => undefined);
    }

    const snapshot: CachedSessionSnapshot = {
      userId: dbSession.user.id,
      email: dbSession.user.email,
      fullName: dbSession.user.fullName,
      userStatus: dbSession.user.status,
      mfaEnabled: dbSession.user.mfaEnabled,
      sessionId: dbSession.id,
      sessionTokenHash: dbSession.tokenHash,
      scope: dbSession.scope,
      csrfSecret: dbSession.csrfSecret,
      mfaVerifiedAt: dbSession.mfaVerifiedAt ? dbSession.mfaVerifiedAt.toISOString() : null,
      roles,
      permissions: Array.from(permissionSet),
      createdAt: dbSession.createdAt.toISOString(),
      lastSeenAt: effectiveLastSeenAt.toISOString(),
      expiresAt: effectiveExpiresAt.toISOString(),
    };

    await this.cacheSnapshot(snapshot);
    return this.snapshotToResolvedSession(snapshot);
  }

  private async touchActivityIfStale(
    snapshot: CachedSessionSnapshot,
    now: Date,
  ): Promise<void> {
    const lastSeenMs = new Date(snapshot.lastSeenAt).getTime();
    if (now.getTime() - lastSeenMs < 60_000) {
      return;
    }

    const nextExpiresAt = this.computeExpiresAt(
      snapshot.scope,
      now,
      new Date(snapshot.createdAt),
    );
    snapshot.lastSeenAt = now.toISOString();
    snapshot.expiresAt = nextExpiresAt.toISOString();

    await this.prisma.client.session
      .updateMany({
        where: { id: snapshot.sessionId, revokedAt: null },
        data: {
          lastSeenAt: now,
          expiresAt: nextExpiresAt,
        },
      })
      .catch(() => undefined);

    await this.cacheSnapshot(snapshot);
  }

  async invalidateTokenCache(tokenHash: string): Promise<void> {
    try {
      await this.redis.del(`${SESSION_CACHE_PREFIX}${tokenHash}`);
    } catch {
      // Ignore Redis unavailability on cache invalidation.
    }
  }

  async invalidateUserCache(userId: string): Promise<void> {
    const sessions = await this.prisma.client.session.findMany({
      where: { userId, revokedAt: null },
      select: { tokenHash: true },
    });
    if (sessions.length === 0) {
      return;
    }
    const keys = sessions.map((s) => `${SESSION_CACHE_PREFIX}${s.tokenHash}`);
    try {
      await this.redis.del(...keys);
    } catch {
      // Ignore Redis unavailability on cache invalidation.
    }
  }

  async markMfaVerified(
    sessionId: string,
    tokenHash: string,
    verifiedAt: Date,
    tx?: PrismaTransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma.client;
    await db.session.update({
      where: { id: sessionId },
      data: {
        mfaVerifiedAt: verifiedAt,
        lastSeenAt: verifiedAt,
      },
    });
    await this.invalidateTokenCache(tokenHash);
  }

  async rotateSession(
    current: ResolvedSession,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<CreatedSessionResult> {
    const now = new Date();
    const created = await this.prisma.withTransaction(async (tx) => {
      await tx.session.updateMany({
        where: { id: current.actor.sessionId, revokedAt: null },
        data: { revokedAt: now },
      });

      return this.createSession({
        userId: current.actor.userId,
        scope: current.actor.scope,
        ipAddress,
        userAgent,
        mfaVerifiedAt: current.actor.mfaVerifiedAt,
        tx,
      });
    });

    await this.invalidateTokenCache(current.actor.sessionTokenHash);
    return created;
  }

  async revokeSessionById(sessionId: string, userId: string): Promise<boolean> {
    const target = await this.prisma.client.session.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
      select: { id: true, tokenHash: true },
    });

    if (!target) {
      return false;
    }

    const updated = await this.prisma.client.session.updateMany({
      where: { id: target.id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.invalidateTokenCache(target.tokenHash);
    return updated.count > 0;
  }

  async revokeCurrentSession(sessionTokenHash: string): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: { tokenHash: sessionTokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.invalidateTokenCache(sessionTokenHash);
  }

  async revokeAllUserSessions(
    userId: string,
    tx?: PrismaTransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma.client;
    const activeSessions = await db.session.findMany({
      where: { userId, revokedAt: null },
      select: { tokenHash: true },
    });

    if (activeSessions.length === 0) {
      return;
    }

    await db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const keys = activeSessions.map((s) => `${SESSION_CACHE_PREFIX}${s.tokenHash}`);
    try {
      await this.redis.del(...keys);
    } catch {
      // Cache deletion failure is non-fatal when DB row is revoked.
    }
  }
}
