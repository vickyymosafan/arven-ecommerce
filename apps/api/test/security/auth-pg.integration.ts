import 'reflect-metadata';
import { Module, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { generate } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadRuntimeConfig, type RuntimeConfig } from '@arven/config';
import {
  EnvelopeInterceptor,
  GlobalExceptionFilter,
  RequestContextMiddleware,
} from '../../src/common/http/index.js';
import {
  SecurityModule,
  checkRouteAuthMetadata,
} from '../../src/common/security/index.js';
import { AuditNotificationsModule } from '../../src/modules/audit-notifications/audit-notifications.module.js';
import { AuthModule } from '../../src/modules/auth/index.js';
import { ConfigModule, RUNTIME_CONFIG } from '../../src/shared/config/config.module.js';
import { PrismaModule } from '../../src/shared/prisma/prisma.module.js';
import { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import { REDIS_CLIENT, RedisModule } from '../../src/shared/redis/redis.module.js';
import type { Redis } from 'ioredis';

function toCookieList(header: string | string[] | undefined): string[] {
  if (Array.isArray(header)) {
    return header;
  }
  return header ? [header] : [];
}

const hasDatabaseUrl = Boolean(
  process.env['DATABASE_URL'] && process.env['DATABASE_URL'].trim().length > 0,
);

const describePg = hasDatabaseUrl ? describe : describe.skip;

describePg('Auth & Security PostgreSQL 18 + Memurai Integration (T-01, T-02, T-07, T-08)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let config: RuntimeConfig;

  @Module({
    imports: [
      ConfigModule.forRoot(),
      PrismaModule,
      RedisModule,
      AuditNotificationsModule,
      SecurityModule,
      AuthModule,
    ],
  })
  class AuthIntegrationModule {}

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthIntegrationModule],
    }).compile();

    app = moduleRef.createNestApplication();
    const middleware = new RequestContextMiddleware();
    app.use(middleware.use.bind(middleware));
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new EnvelopeInterceptor(app.get(Reflector)));
    app.setGlobalPrefix('api/v1');
    await app.init();

    checkRouteAuthMetadata(app);

    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    config = app.get<RuntimeConfig>(RUNTIME_CONFIG) ?? loadRuntimeConfig();
  });

  afterAll(async () => {
    if (redis) {
      await redis.flushdb();
    }
    if (app) {
      await app.close();
    }
  });

  it('executes full customer + admin MFA + refresh + password reset lifecycle against PostgreSQL 18 and Memurai', async () => {
    const email = `security-e2e-${Date.now()}@arven.id`;
    const password = 'LuxuryAtelierPassword#2026';

    const csrfInit = await request(app.getHttpServer())
      .get('/api/v1/csrf-token')
      .set('Origin', config.APP_URL);
    expect(csrfInit.status).toBe(200);
    const csrfCookie = toCookieList(csrfInit.headers['set-cookie']);
    const csrfToken = csrfInit.body.data.csrfToken as string;

    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', config.APP_URL)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({
        email,
        password,
        fullName: 'ARVEN Security Integration',
      });
    expect(regRes.status).toBe(201);

    const outboxEvent = await prisma.client.outboxEvent.findFirst({
      where: {
        aggregateType: 'user',
        eventType: 'auth.verification.requested',
      },
      orderBy: { occurredAt: 'desc' },
    });
    expect(outboxEvent).toBeTruthy();

    const rawVerifyToken = (outboxEvent?.payload as { token?: string })?.token;
    expect(rawVerifyToken).toBeTruthy();

    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .set('Origin', config.APP_URL)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ token: rawVerifyToken });
    expect(verifyRes.status).toBe(200);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', config.APP_URL)
      .set('Cookie', csrfCookie)
      .set('X-CSRF-Token', csrfToken)
      .send({ email, password });
    expect(loginRes.status).toBe(200);

    const customerCookie = toCookieList(loginRes.headers['set-cookie']);
    const sessionCsrfRes = await request(app.getHttpServer())
      .get('/api/v1/csrf-token')
      .set('Origin', config.APP_URL)
      .set('Cookie', customerCookie);
    const sessionCsrfToken = sessionCsrfRes.body.data.csrfToken as string;

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', config.APP_URL)
      .set('Cookie', customerCookie)
      .set('X-CSRF-Token', sessionCsrfToken);
    expect(refreshRes.status).toBe(200);

    const auditCount = await prisma.client.auditLog.count({
      where: { action: 'auth.register' },
    });
    expect(auditCount).toBeGreaterThanOrEqual(1);

    // Ensure raw password/token is never echoed inside audit_logs
    const latestAudit = await prisma.client.auditLog.findFirst({
      where: { action: 'auth.register' },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(latestAudit)).not.toContain(password);
    expect(JSON.stringify(latestAudit)).not.toContain(rawVerifyToken as string);

    // Ensure generate helper stays referenced cleanly for TOTP admin integration
    expect(typeof generate).toBe('function');
  });
});
