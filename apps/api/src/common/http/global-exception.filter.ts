import { randomUUID } from 'node:crypto';
import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  createLogger,
  getRequestId,
  scrubSensitiveMetadata,
  type ArvenLogger,
} from '@arven/observability';
import { DomainHttpException, type ApiErrorDetail } from './domain-http.exception.js';
import {
  resolveRequestId,
  type HttpRequestLike,
  type HttpResponseLike,
} from './request-context.middleware.js';

interface PrismaKnownErrorLike {
  code: string;
  name?: string;
  clientVersion?: string;
}

function isPrismaKnownError(error: unknown): error is PrismaKnownErrorLike {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as Record<string, unknown>;
  return (
    typeof candidate['code'] === 'string' &&
    candidate['code'].startsWith('P') &&
    (candidate['name'] === 'PrismaClientKnownRequestError' ||
      typeof candidate['clientVersion'] === 'string')
  );
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION_ERROR';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'RESOURCE_NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR';
  }
}

function normalizeDetails(
  details: ApiErrorDetail[] | undefined,
): Array<{ field: string; issue: string }> | undefined {
  if (!details || details.length === 0) {
    return undefined;
  }
  return details.map((detail) => ({
    field: detail.field && detail.field.length > 0 ? detail.field : 'request',
    issue: detail.issue,
  }));
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger: ArvenLogger;

  constructor(logger?: ArvenLogger) {
    this.logger =
      logger ??
      createLogger({
        service: '@arven/api:http',
        level: 'info',
        env: process.env['NODE_ENV'] ?? 'development',
      });
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<HttpRequestLike>();
    const res = http.getResponse<HttpResponseLike>();

    const requestId = getRequestId() ?? resolveRequestId(req) ?? randomUUID();
    res.setHeader('X-Request-Id', requestId);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected internal error occurred';
    let details: Array<{ field: string; issue: string }> | undefined;

    if (exception instanceof DomainHttpException) {
      status = exception.getStatus();
      code = exception.code;
      message =
        status >= 500 && exception.code === 'INTERNAL_ERROR'
          ? 'An unexpected internal error occurred'
          : exception.message;
      details = normalizeDetails(exception.details);
    } else if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = 'RATE_LIMITED';
      message = 'Too many requests';
    } else if (isPrismaKnownError(exception)) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'CONFLICT';
        message = 'A conflicting resource already exists';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'RESOURCE_NOT_FOUND';
        message = 'Requested resource was not found';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.CONFLICT;
        code = 'REFERENCE_CONFLICT';
        message = 'Referenced resource constraint violated';
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const rawResponse = exception.getResponse();
      if (status >= 500) {
        code = defaultCodeForStatus(status);
        message = 'An unexpected internal error occurred';
      } else if (typeof rawResponse === 'string') {
        code = defaultCodeForStatus(status);
        message = rawResponse;
      } else if (typeof rawResponse === 'object' && rawResponse !== null) {
        const record = rawResponse as Record<string, unknown>;
        code =
          typeof record['code'] === 'string' && record['code'].length > 0
            ? record['code']
            : defaultCodeForStatus(status);
        if (Array.isArray(record['details'])) {
          const parsedDetails: ApiErrorDetail[] = [];
          for (const item of record['details']) {
            if (typeof item === 'object' && item !== null) {
              const entry = item as Record<string, unknown>;
              if (typeof entry['issue'] === 'string') {
                parsedDetails.push({
                  ...(typeof entry['field'] === 'string' ? { field: entry['field'] } : {}),
                  issue: entry['issue'],
                });
              }
            }
          }
          details = normalizeDetails(parsedDetails);
        }
        if (typeof record['message'] === 'string' && record['message'].length > 0) {
          message = record['message'];
        } else if (Array.isArray(record['message']) && record['message'].length > 0) {
          message = 'Request validation failed';
          if (!details) {
            details = record['message']
              .filter((item): item is string => typeof item === 'string')
              .map((issue) => ({ field: 'request', issue }));
          }
        } else {
          message = exception.message;
        }
      } else {
        code = defaultCodeForStatus(status);
        message = exception.message;
      }
    }

    const requestMethod = req.method ?? 'UNKNOWN';
    const requestPath = req.originalUrl ?? req.url ?? '/';

    if (status >= 500) {
      const errName = exception instanceof Error ? exception.name : 'UnknownError';
      const errMessage = exception instanceof Error ? exception.message : 'Non-error thrown';
      const scrubbed = scrubSensitiveMetadata({
        requestId,
        method: requestMethod,
        path: requestPath,
        status,
        code,
        errorName: errName,
        errorMessage: errMessage,
      });
      this.logger.error(
        typeof scrubbed === 'object' && scrubbed !== null ? scrubbed : { requestId, status },
        'Unhandled server exception',
      );
    } else {
      this.logger.warn(
        {
          requestId,
          method: requestMethod,
          path: requestPath,
          status,
          code,
        },
        'HTTP request rejected',
      );
    }

    res.status(status).json({
      success: false,
      error: {
        code,
        message,
        ...(details && details.length > 0 ? { details } : {}),
      },
      meta: {
        requestId,
      },
    });
  }
}
