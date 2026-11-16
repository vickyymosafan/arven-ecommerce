import { HttpStatus } from '@nestjs/common';
import { IdempotencyStatus } from '@arven/database';
import { describe, expect, it, vi } from 'vitest';
import {
  DomainHttpException,
  IdempotencyService,
  canonicalJsonStringify,
  sha256CanonicalPayload,
  type IdempotencyResponseLike,
} from '../../src/common/http/index.js';
import type { PrismaService } from '../../src/shared/prisma/prisma.service.js';

function createMockResponse(): {
  res: IdempotencyResponseLike;
  headers: Record<string, string>;
  statusCalls: number[];
} {
  const headers: Record<string, string> = {};
  const statusCalls: number[] = [];
  const res: IdempotencyResponseLike = {
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      statusCalls.push(code);
      res.statusCode = code;
      return res;
    },
  };
  return { res, headers, statusCalls };
}

describe('IdempotencyService & canonical JSON hashing', () => {
  it('produces identical canonical JSON and SHA-256 hashes regardless of object key order', () => {
    const payloadA = {
      warehouseCode: 'JKT-MAIN-01',
      quantityDelta: 5,
      nested: { z: 1, a: 'alpha', list: [{ b: true, a: false }] },
      ignored: undefined,
    };
    const payloadB = {
      nested: { a: 'alpha', list: [{ a: false, b: true }], z: 1 },
      quantityDelta: 5,
      warehouseCode: 'JKT-MAIN-01',
    };

    expect(canonicalJsonStringify(payloadA)).toBe(canonicalJsonStringify(payloadB));
    expect(sha256CanonicalPayload(payloadA)).toBe(sha256CanonicalPayload(payloadB));
    expect(sha256CanonicalPayload(payloadA)).toHaveLength(64);
    expect(sha256CanonicalPayload({ quantityDelta: 6 })).not.toBe(
      sha256CanonicalPayload(payloadA),
    );
  });

  it('rejects missing or malformed Idempotency-Key with 400 INVALID_IDEMPOTENCY_KEY', async () => {
    const prismaMock = {} as unknown as PrismaService;
    const service = new IdempotencyService(prismaMock);
    const { res } = createMockResponse();

    await expect(
      service.execute({
        idempotencyKey: undefined,
        actorScope: 'admin:1',
        route: 'POST:/api/v1/admin/stock-movements',
        requestPayload: {},
        res,
        run: async () => ({ ok: true }),
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_IDEMPOTENCY_KEY',
    });

    await expect(
      service.execute({
        idempotencyKey: 'short-key',
        actorScope: 'admin:1',
        route: 'POST:/api/v1/admin/stock-movements',
        requestPayload: {},
        res,
        run: async () => ({ ok: true }),
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_IDEMPOTENCY_KEY',
    });

    await expect(
      service.execute({
        idempotencyKey: 'invalid key with spaces!!',
        actorScope: 'admin:1',
        route: 'POST:/api/v1/admin/stock-movements',
        requestPayload: {},
        res,
        run: async () => ({ ok: true }),
      }),
    ).rejects.toBeInstanceOf(DomainHttpException);
  });

  it('completes and replays COMPLETED records with Idempotent-Replayed header', async () => {
    const updateMock = vi.fn(async () => ({}));
    const createMock = vi.fn(async () => ({ id: 'idem-rec-1' }));
    const findUniqueMock = vi.fn();
    const prismaMock = {
      client: {
        idempotencyRecord: {
          create: createMock,
          findUnique: findUniqueMock,
          deleteMany: vi.fn(async () => ({ count: 0 })),
        },
      },
      withTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
        fn({
          idempotencyRecord: { update: updateMock },
        }),
    } as unknown as PrismaService;

    const service = new IdempotencyService(prismaMock);
    const first = createMockResponse();
    const payload = { variantId: 'v-1', quantityDelta: 4 };

    const createdResult = await service.execute({
      idempotencyKey: 'idem-unit-test-key-0001',
      actorScope: 'admin:u-1',
      route: 'POST:/api/v1/admin/stock-movements',
      requestPayload: payload,
      res: first.res,
      successStatus: HttpStatus.CREATED,
      run: async () => ({ movementId: 'mov-1', qty: 4 }),
    });

    expect(createdResult).toEqual({ movementId: 'mov-1', qty: 4 });
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'idem-rec-1' },
      data: {
        status: IdempotencyStatus.COMPLETED,
        responseStatus: 201,
        responseBody: { movementId: 'mov-1', qty: 4 },
      },
    });

    // Simulate replay with nested @prisma/adapter-pg 23505 error
    createMock.mockRejectedValueOnce({
      meta: {
        driverAdapterError: {
          cause: { originalCode: '23505' },
        },
      },
    });
    findUniqueMock.mockResolvedValueOnce({
      id: 'idem-rec-1',
      requestHash: sha256CanonicalPayload(payload),
      status: IdempotencyStatus.COMPLETED,
      responseStatus: 201,
      responseBody: { movementId: 'mov-1', qty: 4 },
      expiresAt: new Date(Date.now() + 60_000),
    });

    const replay = createMockResponse();
    const runSpy = vi.fn();
    const replayResult = await service.execute({
      idempotencyKey: 'idem-unit-test-key-0001',
      actorScope: 'admin:u-1',
      route: 'POST:/api/v1/admin/stock-movements',
      requestPayload: { quantityDelta: 4, variantId: 'v-1' },
      res: replay.res,
      successStatus: HttpStatus.CREATED,
      run: runSpy,
    });

    expect(runSpy).not.toHaveBeenCalled();
    expect(replayResult).toEqual({ movementId: 'mov-1', qty: 4 });
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.statusCalls).toEqual([201]);
  });

  it('rejects payload mismatch with 409 IDEMPOTENCY_CONFLICT and IN_PROGRESS with Retry-After', async () => {
    const createMock = vi.fn().mockRejectedValue({ code: 'P2002' });
    const findUniqueMock = vi.fn();
    const prismaMock = {
      client: {
        idempotencyRecord: {
          create: createMock,
          findUnique: findUniqueMock,
        },
      },
    } as unknown as PrismaService;

    const service = new IdempotencyService(prismaMock);

    findUniqueMock.mockResolvedValueOnce({
      id: 'idem-rec-2',
      requestHash: sha256CanonicalPayload({ delta: 5 }),
      status: IdempotencyStatus.COMPLETED,
      responseStatus: 201,
      responseBody: {},
      expiresAt: new Date(Date.now() + 60_000),
    });

    const conflictRes = createMockResponse();
    await expect(
      service.execute({
        idempotencyKey: 'idem-unit-test-key-0002',
        actorScope: 'admin:u-1',
        route: 'POST:/api/v1/admin/stock-movements',
        requestPayload: { delta: 10 },
        res: conflictRes.res,
        run: async () => ({}),
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

    findUniqueMock.mockResolvedValueOnce({
      id: 'idem-rec-3',
      requestHash: sha256CanonicalPayload({ delta: 5 }),
      status: IdempotencyStatus.IN_PROGRESS,
      responseStatus: null,
      responseBody: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const inProgressRes = createMockResponse();
    await expect(
      service.execute({
        idempotencyKey: 'idem-unit-test-key-0003',
        actorScope: 'admin:u-1',
        route: 'POST:/api/v1/admin/stock-movements',
        requestPayload: { delta: 5 },
        res: inProgressRes.res,
        run: async () => ({}),
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_IN_PROGRESS' });
    expect(inProgressRes.headers['Retry-After']).toBe('2');
  });

  it('cleans up IN_PROGRESS row on error and replaces expired records', async () => {
    const deleteManyMock = vi.fn(async () => ({ count: 1 }));
    const createMock = vi
      .fn()
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockResolvedValueOnce({ id: 'idem-rec-fresh' });
    const findUniqueMock = vi.fn().mockResolvedValueOnce({
      id: 'idem-rec-expired',
      requestHash: sha256CanonicalPayload({ old: true }),
      status: IdempotencyStatus.COMPLETED,
      responseStatus: 201,
      responseBody: { stale: true },
      expiresAt: new Date(Date.now() - 10_000),
    });
    const updateMock = vi.fn(async () => ({}));

    const prismaMock = {
      client: {
        idempotencyRecord: {
          create: createMock,
          findUnique: findUniqueMock,
          deleteMany: deleteManyMock,
        },
      },
      withTransaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
        fn({
          idempotencyRecord: { update: updateMock },
        }),
    } as unknown as PrismaService;

    const service = new IdempotencyService(prismaMock);
    const { res } = createMockResponse();

    await expect(
      service.execute({
        idempotencyKey: 'idem-unit-test-key-0004',
        actorScope: 'admin:u-1',
        route: 'POST:/api/v1/admin/stock-movements',
        requestPayload: { fresh: true },
        res,
        run: async () => {
          throw new DomainHttpException(
            HttpStatus.CONFLICT,
            'INSUFFICIENT_STOCK',
            'Insufficient stock',
          );
        },
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    expect(deleteManyMock).toHaveBeenCalledTimes(2);
    expect(deleteManyMock).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'idem-rec-fresh',
        idempotencyKey: 'idem-unit-test-key-0004',
        actorScope: 'admin:u-1',
        route: 'POST:/api/v1/admin/stock-movements',
        status: IdempotencyStatus.IN_PROGRESS,
      },
    });
  });
});
