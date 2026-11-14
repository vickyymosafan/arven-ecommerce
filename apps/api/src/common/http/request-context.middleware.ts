import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { HTTP_HEADERS } from '@arven/config';
import { runWithRequestContext } from '@arven/observability';
import { requestIdHeaderSchema } from '@arven/validators';

export const ARVEN_REQUEST_ID_KEY = Symbol('ARVEN_REQUEST_ID');

export interface HttpRequestLike {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  url?: string;
  [ARVEN_REQUEST_ID_KEY]?: string;
}

export interface HttpResponseLike {
  statusCode?: number;
  setHeader(name: string, value: string): unknown;
  status(code: number): {
    json(body: unknown): unknown;
  };
}

export type HttpNextFunction = (error?: unknown) => void;

export type RequestWithArvenContext = HttpRequestLike;

export function resolveRequestId(req: HttpRequestLike): string {
  const cached = req[ARVEN_REQUEST_ID_KEY];
  if (cached) {
    return cached;
  }

  const rawHeader = req.headers[HTTP_HEADERS.REQUEST_ID];
  const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (typeof candidate === 'string') {
    const parsed = requestIdHeaderSchema.safeParse(candidate.trim());
    if (parsed.success) {
      return parsed.data;
    }
  }
  return randomUUID();
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: HttpRequestLike, res: HttpResponseLike, next: HttpNextFunction): void {
    const requestId = resolveRequestId(req);
    req[ARVEN_REQUEST_ID_KEY] = requestId;
    res.setHeader('X-Request-Id', requestId);

    runWithRequestContext({ requestId }, () => {
      next();
    });
  }
}
