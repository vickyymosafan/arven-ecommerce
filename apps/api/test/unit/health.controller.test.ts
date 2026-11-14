import { describe, expect, it } from 'vitest';
import type { Redis } from 'ioredis';
import { DomainHttpException } from '../../src/common/http/index.js';
import { HealthController } from '../../src/modules/health/health.controller.js';
import type { PrismaService } from '../../src/shared/prisma/prisma.service.js';

describe('HealthController', () => {
  it('returns live payload matching HealthLiveResponse', () => {
    const controller = new HealthController(
      { ping: async () => undefined } as unknown as PrismaService,
      { ping: async () => 'PONG' } as unknown as Redis,
    );

    const live = controller.getLive();
    expect(live.status).toBe('ok');
    expect(live.service).toBe('@arven/api');
    expect(Number.isNaN(Date.parse(live.timestampUtc))).toBe(false);
  });

  it('returns ready status when PostgreSQL and Redis both respond', async () => {
    const controller = new HealthController(
      { ping: async () => undefined } as unknown as PrismaService,
      { ping: async () => 'PONG' } as unknown as Redis,
    );

    const ready = await controller.getReady();
    expect(ready.status).toBe('ready');
    expect(ready.checks).toEqual({
      postgres: 'up',
      redis: 'up',
    });
    expect(Number.isNaN(Date.parse(ready.timestampUtc))).toBe(false);
  });

  it('throws 503 SERVICE_UNAVAILABLE without leaking connection strings when PostgreSQL fails', async () => {
    const controller = new HealthController(
      {
        ping: async () => {
          throw new Error('ECONNREFUSED postgresql://arven:secret@127.0.0.1:5432');
        },
      } as unknown as PrismaService,
      { ping: async () => 'PONG' } as unknown as Redis,
    );

    try {
      await controller.getReady();
      expect.unreachable('Expected 503 DomainHttpException');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DomainHttpException);
      const httpError = error as DomainHttpException;
      expect(httpError.getStatus()).toBe(503);
      expect(httpError.code).toBe('SERVICE_UNAVAILABLE');
      expect(httpError.message).not.toContain('secret');
      expect(httpError.message).not.toContain('postgresql://');
    }
  });

  it('throws 503 SERVICE_UNAVAILABLE when Redis ping fails', async () => {
    const controller = new HealthController(
      { ping: async () => undefined } as unknown as PrismaService,
      {
        ping: async () => {
          throw new Error('Memurai unreachable');
        },
      } as unknown as Redis,
    );

    await expect(controller.getReady()).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
