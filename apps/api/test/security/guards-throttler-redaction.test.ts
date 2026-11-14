import 'reflect-metadata';
import { Body, Controller, Get, Module, Post, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runtimeEnvSchema, type RuntimeConfig } from '@arven/config';
import { SessionScope, UserStatus } from '@arven/database';
import { createLogger } from '@arven/observability';
import {
  EnvelopeInterceptor,
  GlobalExceptionFilter,
  RequestContextMiddleware,
} from '../../src/common/http/index.js';
import {
  AdminAuth,
  CurrentActor,
  CustomerAuth,
  PortalAuth,
  Public,
  RequireMfaStepUp,
  RequirePermissions,
  SecurityModule,
  SessionStoreService,
  SkipMfaCheck,
  ThrottleEmail,
  TokenCryptoService,
  checkRouteAuthMetadata,
  type AuthenticatedActor,
} from '../../src/common/security/index.js';
import { AuditLogService } from '../../src/modules/audit-notifications/audit-log.service.js';
import { AuditNotificationsModule } from '../../src/modules/audit-notifications/audit-notifications.module.js';
import { ConfigModule } from '../../src/shared/config/config.module.js';
import { PrismaModule } from '../../src/shared/prisma/prisma.module.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { REDIS_CLIENT, RedisModule } from '../../src/shared/redis/redis.module.js';
import type { Redis } from 'ioredis';

const TEST_CONFIG: RuntimeConfig = runtimeEnvSchema.parse({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/arven_test',
  REDIS_URL: 'redis://127.0.0.1:6379/15',
  SESSION_SECRET: 'arven-test-session-secret-0123456789abcdef0123456789',
  CSRF_SECRET: 'arven-test-csrf-secret-0123456789abcdef0123456789abcd',
  MFA_ENCRYPTION_KEY:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:3001',
});

@Controller('test-security')
class TestSecurityController {
  @Get('public')
  @Public()
  getPublic(): { ok: true } {
    return { ok: true };
  }

  @Post('throttled-login')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ThrottleEmail()
  postThrottledLogin(@Body() body: { email?: string }): { email?: string } {
    return { email: body.email };
  }

  @Post('customer-mutation')
  @CustomerAuth()
  customerMutation(@CurrentActor() actor: AuthenticatedActor): { userId: string } {
    return { userId: actor.userId };
  }

  @Get('admin/reports')
  @AdminAuth()
  @RequirePermissions('analytics.read')
  getAdminReports(@CurrentActor() actor: AuthenticatedActor): { userId: string } {
    return { userId: actor.userId };
  }

  @Post('admin/refunds/approve')
  @AdminAuth()
  @RequirePermissions('refund.approve')
  @RequireMfaStepUp(900)
  approveRefund(@CurrentActor() actor: AuthenticatedActor): { approvedBy: string } {
    return { approvedBy: actor.userId };
  }

  @Get('portal-me')
  @PortalAuth()
  portalMe(@CurrentActor() actor: AuthenticatedActor): { scope: SessionScope } {
    return { scope: actor.scope };
  }
}

@Controller('auth/test')
class TestAuthSkipMfaController {
  @Get('me')
  @PortalAuth()
  @SkipMfaCheck()
  getAuthMe(@CurrentActor() actor: AuthenticatedActor): { scope: SessionScope } {
    return { scope: actor.scope };
  }
}

@Controller('broken-missing-auth')
class BrokenMissingAuthController {
  @Get('open')
  getOpen(): { ok: true } {
    return { ok: true };
  }
}

@Controller('broken-skip-mfa')
class BrokenSkipMfaController {
  @Get('outside-auth')
  @AdminAuth()
  @SkipMfaCheck()
  getOutsideAuth(): { ok: true } {
    return { ok: true };
  }
}

describe('SecurityModule Guards, Memurai Throttling, Metadata Verification & Log Redaction', () => {
  let app: INestApplication;
  let redis: Redis;
  let tokenCrypto: TokenCryptoService;
  let sessionStore: SessionStoreService;

  interface FakeSessionRow {
    id: string;
    userId: string;
    scope: SessionScope;
    tokenHash: string;
    csrfSecret: string;
    mfaVerifiedAt: Date | null;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
    lastSeenAt: Date;
    user: {
      id: string;
      email: string;
      fullName: string;
      status: UserStatus;
      mfaEnabled: boolean;
      userRoles: Array<{
        role: {
          code: string;
          rolePermissions: Array<{ permission: { code: string } }>;
        };
      }>;
    };
  }

  const fakeSessions = new Map<string, FakeSessionRow>();

  beforeAll(async () => {
    const fakePrisma = {
      client: {
        session: {
          findUnique: async (args: { where: { tokenHash: string } }) =>
            fakeSessions.get(args.where.tokenHash) ?? null,
          updateMany: async () => ({ count: 1 }),
          findMany: async () => [],
        },
      },
      ping: async () => undefined,
      withTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
        fn({}),
    };

    const fakeAudit = {
      record: async () => undefined,
    };

    @Module({
      imports: [
        ConfigModule.forRoot(TEST_CONFIG),
        PrismaModule,
        RedisModule,
        AuditNotificationsModule,
        SecurityModule,
      ],
      controllers: [TestSecurityController, TestAuthSkipMfaController],
    })
    class TestSecurityAppModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestSecurityAppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .overrideProvider(AuditLogService)
      .useValue(fakeAudit)
      .compile();

    app = moduleRef.createNestApplication();
    const middleware = new RequestContextMiddleware();
    app.use(middleware.use.bind(middleware));
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new EnvelopeInterceptor(app.get(Reflector)));
    await app.init();

    checkRouteAuthMetadata(app);

    redis = app.get<Redis>(REDIS_CLIENT);
    tokenCrypto = app.get(TokenCryptoService);
    sessionStore = app.get(SessionStoreService);
  });

  beforeEach(async () => {
    fakeSessions.clear();
    await redis.flushdb();
  });

  afterAll(async () => {
    if (redis) {
      await redis.flushdb();
    }
    if (app) {
      await app.close();
    }
  });

  function seedSession(opts: {
    rawToken: string;
    scope: SessionScope;
    roles: string[];
    permissions: string[];
    mfaVerifiedAt: Date | null;
  }): string {
    const tokenHash = tokenCrypto.sha256Hex(opts.rawToken);
    const csrfSecret = tokenCrypto.createSessionCsrfSecret();
    const now = new Date();

    fakeSessions.set(tokenHash, {
      id: `sess-${opts.scope}-${tokenHash.slice(0, 8)}`,
      userId: `user-${opts.scope}`,
      scope: opts.scope,
      tokenHash,
      csrfSecret,
      mfaVerifiedAt: opts.mfaVerifiedAt,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      revokedAt: null,
      createdAt: now,
      lastSeenAt: now,
      user: {
        id: `user-${opts.scope}`,
        email: `${opts.scope.toLowerCase()}@arven.id`,
        fullName: `${opts.scope} User`,
        status: UserStatus.ACTIVE,
        mfaEnabled: opts.scope === SessionScope.ADMIN,
        userRoles: opts.roles.map((code) => ({
          role: {
            code,
            rolePermissions: opts.permissions.map((perm) => ({
              permission: { code: perm },
            })),
          },
        })),
      },
    });

    return tokenCrypto.deriveSessionCsrfToken(csrfSecret);
  }

  it('fails closed in checkRouteAuthMetadata for unannotated or misconfigured routes', async () => {
    @Module({
      controllers: [BrokenMissingAuthController],
    })
    class BrokenModuleA {}

    const brokenRefA = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(TEST_CONFIG),
        PrismaModule,
        RedisModule,
        AuditNotificationsModule,
        SecurityModule,
        BrokenModuleA,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ client: {} })
      .overrideProvider(REDIS_CLIENT)
      .useValue({ status: 'wait', disconnect: () => undefined })
      .overrideProvider(AuditLogService)
      .useValue({ record: async () => undefined })
      .compile();

    const brokenAppA = brokenRefA.createNestApplication();
    await brokenAppA.init();
    expect(() => checkRouteAuthMetadata(brokenAppA)).toThrow(
      /BrokenMissingAuthController\.getOpen/,
    );
    await brokenAppA.close();

    @Module({
      controllers: [BrokenSkipMfaController],
    })
    class BrokenModuleB {}

    const brokenRefB = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(TEST_CONFIG),
        PrismaModule,
        RedisModule,
        AuditNotificationsModule,
        SecurityModule,
        BrokenModuleB,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ client: {} })
      .overrideProvider(REDIS_CLIENT)
      .useValue({ status: 'wait', disconnect: () => undefined })
      .overrideProvider(AuditLogService)
      .useValue({ record: async () => undefined })
      .compile();

    const brokenAppB = brokenRefB.createNestApplication();
    await brokenAppB.init();
    expect(() => checkRouteAuthMetadata(brokenAppB)).toThrow(/@SkipMfaCheck/);
    await brokenAppB.close();
  });

  it('enforces CSRF Origin and HMAC token validation (T-02) before session auth', async () => {
    const rawToken = 'customer-raw-token-0123456789abcdef';
    const csrfToken = seedSession({
      rawToken,
      scope: SessionScope.CUSTOMER,
      roles: ['CUSTOMER'],
      permissions: [],
      mfaVerifiedAt: null,
    });

    const missingCsrfRes = await request(app.getHttpServer())
      .post('/test-security/customer-mutation')
      .set('Cookie', `${TEST_CONFIG.STOREFRONT_SESSION_COOKIE}=${rawToken}`);

    expect(missingCsrfRes.status).toBe(403);
    expect(missingCsrfRes.body.error.code).toBe('CSRF_INVALID');

    const badOriginRes = await request(app.getHttpServer())
      .post('/test-security/customer-mutation')
      .set('Origin', 'https://attacker.example')
      .set('Cookie', `${TEST_CONFIG.STOREFRONT_SESSION_COOKIE}=${rawToken}`)
      .set('X-CSRF-Token', csrfToken);

    expect(badOriginRes.status).toBe(403);
    expect(badOriginRes.body.error.code).toBe('CSRF_INVALID');

    const validRes = await request(app.getHttpServer())
      .post('/test-security/customer-mutation')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `${TEST_CONFIG.STOREFRONT_SESSION_COOKIE}=${rawToken}`)
      .set('X-CSRF-Token', csrfToken);

    expect(validRes.status).toBe(201);
    expect(validRes.body.data.userId).toBe('user-CUSTOMER');
  });

  it('enforces strict scope isolation, pre-MFA gate, step-up freshness, and RBAC (T-01)', async () => {
    const customerToken = 'cust-isolation-token-0123456789abcdef';
    seedSession({
      rawToken: customerToken,
      scope: SessionScope.CUSTOMER,
      roles: ['CUSTOMER'],
      permissions: ['analytics.read'],
      mfaVerifiedAt: null,
    });

    const crossScopeRes = await request(app.getHttpServer())
      .get('/test-security/admin/reports')
      .set('Cookie', `${TEST_CONFIG.STOREFRONT_SESSION_COOKIE}=${customerToken}`);

    expect(crossScopeRes.status).toBe(401);
    expect(crossScopeRes.body.error.code).toBe('UNAUTHORIZED');

    const adminPreMfaToken = 'admin-premfa-token-0123456789abcdef';
    seedSession({
      rawToken: adminPreMfaToken,
      scope: SessionScope.ADMIN,
      roles: ['MANAGER'],
      permissions: ['analytics.read'],
      mfaVerifiedAt: null,
    });

    const mfaRequiredRes = await request(app.getHttpServer())
      .get('/test-security/admin/reports')
      .set('Cookie', `${TEST_CONFIG.ADMIN_SESSION_COOKIE}=${adminPreMfaToken}`);

    expect(mfaRequiredRes.status).toBe(401);
    expect(mfaRequiredRes.body.error.code).toBe('MFA_REQUIRED');

    const staleStepUpToken = 'admin-stale-stepup-token-0123456789abc';
    const staleCsrf = seedSession({
      rawToken: staleStepUpToken,
      scope: SessionScope.ADMIN,
      roles: ['OWNER'],
      permissions: ['refund.approve', 'analytics.read'],
      mfaVerifiedAt: new Date(Date.now() - 20 * 60 * 1000),
    });

    const stepUpRejected = await request(app.getHttpServer())
      .post('/test-security/admin/refunds/approve')
      .set('Origin', 'http://localhost:3001')
      .set('Cookie', `${TEST_CONFIG.ADMIN_SESSION_COOKIE}=${staleStepUpToken}`)
      .set('X-CSRF-Token', staleCsrf);

    expect(stepUpRejected.status).toBe(403);
    expect(stepUpRejected.body.error.code).toBe('MFA_STEP_UP_REQUIRED');

    const freshAdminToken = 'admin-fresh-token-0123456789abcdef01';
    seedSession({
      rawToken: freshAdminToken,
      scope: SessionScope.ADMIN,
      roles: ['SUPPORT'],
      permissions: ['analytics.read.limited'],
      mfaVerifiedAt: new Date(),
    });

    const forbiddenRes = await request(app.getHttpServer())
      .get('/test-security/admin/reports')
      .set('Cookie', `${TEST_CONFIG.ADMIN_SESSION_COOKIE}=${freshAdminToken}`);

    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error.code).toBe('FORBIDDEN');

    const ownerToken = 'admin-owner-fresh-0123456789abcdef01';
    const ownerCsrf = seedSession({
      rawToken: ownerToken,
      scope: SessionScope.ADMIN,
      roles: ['OWNER'],
      permissions: ['refund.approve', 'analytics.read'],
      mfaVerifiedAt: new Date(),
    });

    const allowedStepUp = await request(app.getHttpServer())
      .post('/test-security/admin/refunds/approve')
      .set('Origin', 'http://localhost:3001')
      .set('Cookie', `${TEST_CONFIG.ADMIN_SESSION_COOKIE}=${ownerToken}`)
      .set('X-CSRF-Token', ownerCsrf);

    expect(allowedStepUp.status).toBe(201);
    expect(allowedStepUp.body.data.approvedBy).toBe('user-ADMIN');

    expect(sessionStore.getCookieName(SessionScope.ADMIN)).toBe(
      TEST_CONFIG.ADMIN_SESSION_COOKIE,
    );
  });

  it('enforces dual IP + normalized email rate limiting in Memurai (T-07)', async () => {
    const preAuth = tokenCrypto.issuePreAuthCsrf();
    const csrfCookieName = sessionStore.getPreAuthCsrfCookieName();

    for (let i = 0; i < 3; i++) {
      const res = await request(app.getHttpServer())
        .post('/test-security/throttled-login')
        .set('Origin', 'http://localhost:3000')
        .set('X-Forwarded-For', '203.0.113.10')
        .set('Cookie', `${csrfCookieName}=${preAuth.cookieValue}`)
        .set('X-CSRF-Token', preAuth.token)
        .send({ email: 'TargetUser@ARVEN.id' });

      expect(res.status).toBe(201);
    }

    const blockedSameIp = await request(app.getHttpServer())
      .post('/test-security/throttled-login')
      .set('Origin', 'http://localhost:3000')
      .set('X-Forwarded-For', '203.0.113.10')
      .set('Cookie', `${csrfCookieName}=${preAuth.cookieValue}`)
      .set('X-CSRF-Token', preAuth.token)
      .send({ email: 'other@arven.id' });

    expect(blockedSameIp.status).toBe(429);
    expect(blockedSameIp.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blockedSameIp.headers['retry-after'])).toBeGreaterThan(0);

    const blockedSameEmailDifferentIp = await request(app.getHttpServer())
      .post('/test-security/throttled-login')
      .set('Origin', 'http://localhost:3000')
      .set('X-Forwarded-For', '198.51.100.77')
      .set('Cookie', `${csrfCookieName}=${preAuth.cookieValue}`)
      .set('X-CSRF-Token', preAuth.token)
      .send({ email: 'targetuser@arven.id' });

    expect(blockedSameEmailDifferentIp.status).toBe(429);
    expect(blockedSameEmailDifferentIp.body.error.code).toBe('RATE_LIMITED');
  });

  it('redacts sensitive secrets, tokens, cookies, and PII in structured logs (T-08)', () => {
    const chunks: string[] = [];
    const memoryStream = {
      write(chunk: string): void {
        chunks.push(chunk);
      },
    };

    const logger = createLogger({
      service: '@arven/api:test-redaction',
      level: 'info',
      env: 'test',
      destination: memoryStream,
    });

    logger.info(
      {
        password: 'SuperSecretPassword#2026',
        token: 'raw-opaque-verification-token-secret',
        csrfToken: 'raw-csrf-secret-value',
        totpSecret: 'JBSWY3DPEHPK3PXP',
        email: 'vip.buyer@arven.id',
        phone: '+6281234567890',
        req: {
          headers: {
            cookie: 'arven_admin_sid=supersecretcookie',
            'x-csrf-token': 'raw-header-csrf',
          },
        },
      },
      'Auth redaction verification',
    );

    const output = chunks.join('\n');
    expect(output).toContain('[Redacted]');
    expect(output).not.toContain('SuperSecretPassword#2026');
    expect(output).not.toContain('raw-opaque-verification-token-secret');
    expect(output).not.toContain('raw-csrf-secret-value');
    expect(output).not.toContain('JBSWY3DPEHPK3PXP');
    expect(output).not.toContain('vip.buyer@arven.id');
    expect(output).not.toContain('+6281234567890');
    expect(output).not.toContain('supersecretcookie');
    expect(output).not.toContain('raw-header-csrf');
  });
});
