import { HttpStatus, type ArgumentsHost, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import { createLogger } from '@arven/observability';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
  DomainHttpException,
  EnvelopeInterceptor,
  GlobalExceptionFilter,
  SKIP_ENVELOPE_KEY,
  isPaginatedResponse,
} from '../../src/common/http/index.js';

function createHttpContext(options: {
  statusCode?: number;
  skipEnvelope?: boolean;
  requestId?: string;
}): {
  context: ExecutionContext;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const req = {
    headers: options.requestId ? { 'x-request-id': options.requestId } : {},
    method: 'GET',
    url: '/api/v1/test',
  };
  const res = {
    statusCode: options.statusCode ?? 200,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };

  class DummyController {}
  const handler = () => undefined;
  if (options.skipEnvelope) {
    Reflect.defineMetadata(SKIP_ENVELOPE_KEY, true, handler);
  }

  const context = {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => DummyController,
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;

  return { context, headers };
}

function createFilterHost(requestId = 'req_unit_12345'): {
  host: ArgumentsHost;
  statusCalls: number[];
  jsonBodies: unknown[];
  headers: Record<string, string>;
} {
  const statusCalls: number[] = [];
  const jsonBodies: unknown[] = [];
  const headers: Record<string, string> = {};

  const req = {
    headers: { 'x-request-id': requestId },
    method: 'POST',
    originalUrl: '/api/v1/admin/roles',
    url: '/api/v1/admin/roles',
  };
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    status: (code: number) => {
      statusCalls.push(code);
      return {
        json: (body: unknown) => {
          jsonBodies.push(body);
        },
      };
    },
  };

  const host = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;

  return { host, statusCalls, jsonBodies, headers };
}

describe('HTTP EnvelopeInterceptor & GlobalExceptionFilter', () => {
  it('detects PaginatedResponse strictly', () => {
    expect(isPaginatedResponse({ items: [], page: 1, limit: 20, total: 0 })).toBe(true);
    expect(isPaginatedResponse({ items: [] })).toBe(false);
    expect(isPaginatedResponse(null)).toBe(false);
  });

  it('wraps single payloads and paginated payloads in standard ARVEN envelopes', async () => {
    const interceptor = new EnvelopeInterceptor(new Reflector());

    const single = createHttpContext({ requestId: 'req_12345678' });
    const singleResult = await lastValueFrom(
      interceptor.intercept(single.context, {
        handle: () => of({ ok: true }),
      } as CallHandler),
    );
    expect(singleResult).toEqual({
      success: true,
      data: { ok: true },
      meta: { requestId: 'req_12345678' },
    });
    expect(single.headers['X-Request-Id']).toBe('req_12345678');

    const paginated = createHttpContext({ requestId: 'req_paginated1' });
    const paginatedResult = await lastValueFrom(
      interceptor.intercept(paginated.context, {
        handle: () => of({ items: [{ id: '1' }], page: 2, limit: 20, total: 41 }),
      } as CallHandler),
    );
    expect(paginatedResult).toEqual({
      success: true,
      data: [{ id: '1' }],
      meta: {
        requestId: 'req_paginated1',
        page: 2,
        limit: 20,
        total: 41,
        totalPages: 3,
      },
    });
  });

  it('skips wrapping for 204 responses and @SkipEnvelope handlers', async () => {
    const interceptor = new EnvelopeInterceptor(new Reflector());

    const noContent = createHttpContext({ statusCode: 204 });
    const noContentResult = await lastValueFrom(
      interceptor.intercept(noContent.context, {
        handle: () => of(undefined),
      } as CallHandler),
    );
    expect(noContentResult).toBeUndefined();

    const skipped = createHttpContext({ skipEnvelope: true });
    const skippedResult = await lastValueFrom(
      interceptor.intercept(skipped.context, {
        handle: () => of({ raw: true }),
      } as CallHandler),
    );
    expect(skippedResult).toEqual({ raw: true });
  });

  it('normalizes DomainHttpException, ThrottlerException, Prisma P2002, and unknown 500 without leaking internals', () => {
    const logger = createLogger({ service: '@arven/api:test', level: 'silent', env: 'test' });
    const filter = new GlobalExceptionFilter(logger);

    const domainHost = createFilterHost('req_domain_1');
    filter.catch(
      new DomainHttpException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid payload', [
        { field: 'email', issue: 'Invalid email' },
      ]),
      domainHost.host,
    );
    expect(domainHost.statusCalls[0]).toBe(400);
    expect(domainHost.jsonBodies[0]).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: [{ field: 'email', issue: 'Invalid email' }],
      },
      meta: { requestId: 'req_domain_1' },
    });

    const throttleHost = createFilterHost('req_rate_1');
    filter.catch(new ThrottlerException(), throttleHost.host);
    expect(throttleHost.statusCalls[0]).toBe(429);
    expect(throttleHost.jsonBodies[0]).toMatchObject({
      success: false,
      error: { code: 'RATE_LIMITED' },
    });

    const prismaHost = createFilterHost('req_prisma_1');
    filter.catch(
      { name: 'PrismaClientKnownRequestError', code: 'P2002', clientVersion: '7.0.0' },
      prismaHost.host,
    );
    expect(prismaHost.statusCalls[0]).toBe(409);
    expect(prismaHost.jsonBodies[0]).toMatchObject({
      success: false,
      error: { code: 'CONFLICT' },
    });

    const crashHost = createFilterHost('req_crash_1');
    filter.catch(
      new Error('password=supersecret SELECT * FROM users failed'),
      crashHost.host,
    );
    expect(crashHost.statusCalls[0]).toBe(500);
    const serialized = JSON.stringify(crashHost.jsonBodies[0]);
    expect(serialized).not.toContain('supersecret');
    expect(serialized).not.toContain('SELECT * FROM');
    expect(crashHost.jsonBodies[0]).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected internal error occurred',
      },
      meta: { requestId: 'req_crash_1' },
    });
  });
});
