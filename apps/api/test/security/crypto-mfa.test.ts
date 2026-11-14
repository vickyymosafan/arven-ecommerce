import 'reflect-metadata';
import { performance } from 'node:perf_hooks';
import { Redis } from 'ioredis';
import { generate } from 'otplib';
import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import { runtimeEnvSchema, type RuntimeConfig } from '@arven/config';
import { SessionScope, UserStatus, type PrismaTransactionClient } from '@arven/database';
import {
  PasswordHasherService,
  TokenCryptoService,
  type AuthenticatedActor,
  type HttpRequestLike,
  type SessionStoreService,
} from '../../src/common/security/index.js';
import { DomainHttpException } from '../../src/common/http/domain-http.exception.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import type { PrismaService } from '../../src/shared/prisma/prisma.service.js';
import type { AuditLogService } from '../../src/modules/audit-notifications/audit-log.service.js';
import type { OutboxWriterService } from '../../src/modules/audit-notifications/outbox-writer.service.js';

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

describe('PasswordHasherService', () => {
  const hasher = new PasswordHasherService();

  it('hashes with Argon2id and preserves untrimmed leading/trailing whitespace', async () => {
    const raw = '  LuxuryVault#2026  ';
    const digest = await hasher.hash(raw);

    expect(digest.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(digest, raw)).toBe(true);
    expect(await hasher.verify(digest, raw.trim())).toBe(false);
  });

  it('rejects null bytes and breached/trivial passwords while allowing strong phrases', async () => {
    await expect(hasher.hash('ValidPrefix\u0000Suffix123')).rejects.toBeInstanceOf(
      DomainHttpException,
    );

    expect(() => hasher.assertNotBreachedOrTrivial('password123456')).toThrow(
      DomainHttpException,
    );
    expect(() => hasher.assertNotBreachedOrTrivial('arven1234567')).toThrow(
      DomainHttpException,
    );
    expect(() =>
      hasher.assertNotBreachedOrTrivial('atelier.curator', 'atelier.curator@arven.id'),
    ).toThrow(DomainHttpException);

    expect(() =>
      hasher.assertNotBreachedOrTrivial('ArvenTestPass#2026', 'buyer@arven.id'),
    ).not.toThrow();
  });

  it('executes full Argon2id work in verifyOrDummy when user hash is missing', async () => {
    await hasher.verifyOrDummy(null, 'warm-up-dummy-calibration-2026');

    const startMs = performance.now();
    const matched = await hasher.verifyOrDummy(null, 'AnyCandidatePassword#2026');
    const elapsedMs = performance.now() - startMs;

    expect(matched).toBe(false);
    expect(elapsedMs).toBeGreaterThan(5);
  });
});

describe('TokenCryptoService', () => {
  const tokenCrypto = new TokenCryptoService(TEST_CONFIG);

  it('encrypts and decrypts TOTP secrets with AES-256-GCM and rejects tampering', () => {
    const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    const encrypted = tokenCrypto.encryptTotpSecret(secret);

    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(tokenCrypto.decryptTotpSecret(encrypted)).toBe(secret);

    const [prefix, cipherPart] = encrypted.split(':');
    const segments = (cipherPart ?? '').split('.');
    const tampered = `${prefix}:${segments[0]}.${segments[1]}.${segments[2]?.slice(0, -2)}AA`;
    expect(() => tokenCrypto.decryptTotpSecret(tampered)).toThrow();
  });

  it('validates session-bound CSRF and signed <=2h pre-auth CSRF tokens', () => {
    const csrfSecret = tokenCrypto.createSessionCsrfSecret();
    const token = tokenCrypto.deriveSessionCsrfToken(csrfSecret);

    expect(tokenCrypto.verifySessionCsrfToken(csrfSecret, token)).toBe(true);
    expect(tokenCrypto.verifySessionCsrfToken(csrfSecret, `${token}x`)).toBe(false);

    const nowMs = Date.now();
    const preAuth = tokenCrypto.issuePreAuthCsrf(nowMs);
    expect(preAuth.maxAgeMs).toBeLessThanOrEqual(2 * 60 * 60 * 1000);
    expect(
      tokenCrypto.verifyPreAuthCsrf(preAuth.cookieValue, preAuth.token, nowMs + 1000),
    ).toBe(true);
    expect(
      tokenCrypto.verifyPreAuthCsrf(
        preAuth.cookieValue,
        preAuth.token,
        nowMs + 2 * 60 * 60 * 1000 + 5000,
      ),
    ).toBe(false);
    expect(
      tokenCrypto.verifyPreAuthCsrf(`${preAuth.cookieValue}tamper`, preAuth.token, nowMs),
    ).toBe(false);
  });

  it('generates 8 distinct recovery codes with SHA-256 hashes', () => {
    const codes = tokenCrypto.generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes.map((c) => c.plaintext)).size).toBe(8);
    for (const entry of codes) {
      expect(entry.plaintext).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
      expect(entry.hash).toHaveLength(64);
    }
  });
});

describe('AuthService TOTP Enrollment & Replay Lock', () => {
  let redis: Redis;
  const tokenCrypto = new TokenCryptoService(TEST_CONFIG);
  const hasher = new PasswordHasherService();

  beforeAll(async () => {
    redis = new Redis(TEST_CONFIG.REDIS_URL, { maxRetriesPerRequest: 2 });
    await redis.flushdb();
  });

  afterAll(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  it('blocks /auth/mfa/setup takeover with 403 MFA_ALREADY_ENROLLED and prevents TOTP replay', async () => {
    let userRecord = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'owner@arven.id',
      fullName: 'ARVEN Owner',
      phone: null as string | null,
      status: UserStatus.ACTIVE,
      mfaEnabled: false,
      mfaSecretEncrypted: null as string | null,
      mfaLastTimeStep: null as number | null,
    };

    const recoveryRows: Array<{ userId: string; codeHash: string }> = [];
    const outboxEvents: Array<{ eventType: string }> = [];
    const auditActions: Array<{ action: string }> = [];

    const mockTx = {
      user: {
        updateMany: async (args: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          if (args.where['mfaEnabled'] === false && userRecord.mfaEnabled) {
            return { count: 0 };
          }
          if (args.where['OR'] && userRecord.mfaLastTimeStep !== null) {
            const orList = args.where['OR'] as Array<Record<string, unknown>>;
            const ltObj = orList[1]?.['mfaLastTimeStep'] as { lt: number } | undefined;
            if (ltObj && !(userRecord.mfaLastTimeStep < ltObj.lt)) {
              return { count: 0 };
            }
          }
          userRecord = { ...userRecord, ...args.data } as typeof userRecord;
          return { count: 1 };
        },
      },
      mfaRecoveryCode: {
        createMany: async (args: {
          data: Array<{ userId: string; codeHash: string }>;
        }) => {
          recoveryRows.push(...args.data);
          return { count: args.data.length };
        },
      },
    };

    const mockPrisma = {
      client: {
        user: {
          findUnique: async () => userRecord,
        },
      },
      withTransaction: async <T>(
        fn: (tx: PrismaTransactionClient) => Promise<T>,
      ): Promise<T> => fn(mockTx as unknown as PrismaTransactionClient),
    } as unknown as PrismaService;

    const mockSessionStore = {
      markMfaVerified: async () => undefined,
    } as unknown as SessionStoreService;

    const mockAudit = {
      record: async (input: { action: string }) => {
        auditActions.push({ action: input.action });
      },
    } as unknown as AuditLogService;

    const mockOutbox = {
      enqueue: async (input: { eventType: string }) => {
        outboxEvents.push({ eventType: input.eventType });
        return 'outbox-1';
      },
    } as unknown as OutboxWriterService;

    const authService = new AuthService(
      mockPrisma,
      redis,
      hasher,
      tokenCrypto,
      mockSessionStore,
      mockAudit,
      mockOutbox,
    );

    const actor: AuthenticatedActor = {
      userId: userRecord.id,
      email: userRecord.email,
      fullName: userRecord.fullName,
      sessionId: '00000000-0000-4000-8000-000000000010',
      sessionTokenHash: 'a'.repeat(64),
      scope: SessionScope.ADMIN,
      roles: ['OWNER'],
      permissions: ['user.role.manage'],
      mfaEnabled: false,
      mfaVerifiedAt: null,
    };

    const fakeReq: HttpRequestLike = {
      method: 'POST',
      url: '/api/v1/auth/mfa/setup',
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    };

    const setupResult = await authService.setupMfa(actor, fakeReq);
    expect(setupResult.otpauthUri).toContain('otpauth://totp/');
    expect(userRecord.mfaSecretEncrypted).toBeTruthy();

    const code = await generate({ secret: setupResult.manualEntryKey });
    const verifyResult = await authService.verifyMfa(actor, { code }, fakeReq);

    expect(verifyResult.verified).toBe(true);
    expect(verifyResult.recoveryCodes).toHaveLength(8);
    expect(recoveryRows).toHaveLength(8);
    expect(outboxEvents.map((e) => e.eventType)).toContain('auth.mfa.enabled');
    expect(auditActions.map((a) => a.action)).toContain('auth.mfa.enrolled');

    await expect(authService.setupMfa(actor, fakeReq)).rejects.toMatchObject({
      code: 'MFA_ALREADY_ENROLLED',
    });

    await expect(authService.verifyMfa(actor, { code }, fakeReq)).rejects.toMatchObject({
      code: 'INVALID_MFA_CODE',
    });
  });
});
