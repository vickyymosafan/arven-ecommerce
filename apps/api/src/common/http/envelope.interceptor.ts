import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getRequestId } from '@arven/observability';
import { map, type Observable } from 'rxjs';
import {
  resolveRequestId,
  type HttpRequestLike,
  type HttpResponseLike,
} from './request-context.middleware.js';

export const SKIP_ENVELOPE_KEY = 'arven:skip_envelope';

export const SkipEnvelope = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_ENVELOPE_KEY, true);

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export function isPaginatedResponse<T = unknown>(
  value: unknown,
): value is PaginatedResponse<T> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record['items']) &&
    typeof record['page'] === 'number' &&
    typeof record['limit'] === 'number' &&
    typeof record['total'] === 'number' &&
    Object.keys(record).length === 4
  );
}

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<HttpRequestLike>();
    const res = http.getResponse<HttpResponseLike>();

    return next.handle().pipe(
      map((data: unknown) => {
        if (res.statusCode === 204 || data === undefined) {
          return data;
        }

        const requestId = getRequestId() ?? resolveRequestId(req) ?? randomUUID();
        res.setHeader('X-Request-Id', requestId);

        if (isPaginatedResponse(data)) {
          const safeLimit = Math.max(1, data.limit);
          const totalPages = data.total === 0 ? 0 : Math.ceil(data.total / safeLimit);
          return {
            success: true as const,
            data: data.items,
            meta: {
              requestId,
              page: data.page,
              limit: data.limit,
              total: data.total,
              totalPages,
            },
          };
        }

        return {
          success: true as const,
          data,
          meta: {
            requestId,
          },
        };
      }),
    );
  }
}
