import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getRequestId, scrubSensitiveMetadata } from '@arven/observability';
import { mergeMap, type Observable } from 'rxjs';
import { AuditLogService } from '../../../modules/audit-notifications/audit-log.service.js';
import { AUTH_METADATA_KEYS } from '../decorators.js';
import {
  ARVEN_ACTOR_KEY,
  extractClientIp,
  wasAuditRecordedInTransaction,
  type AuditActionMetadata,
  type AuthenticatedRequest,
  type HttpRequestLike,
} from '../types.js';

function resolveResourceId(req: HttpRequestLike, responseBody: unknown): string {
  if (typeof responseBody === 'object' && responseBody !== null) {
    const obj = responseBody as Record<string, unknown>;
    if (typeof obj['id'] === 'string' && obj['id'].length > 0) {
      return obj['id'];
    }
    const nestedUser = obj['user'];
    if (
      typeof nestedUser === 'object' &&
      nestedUser !== null &&
      typeof (nestedUser as Record<string, unknown>)['id'] === 'string'
    ) {
      return (nestedUser as Record<string, unknown>)['id'] as string;
    }
  }

  const paramId = req.params?.['id'] ?? req.params?.['userId'];
  if (typeof paramId === 'string' && paramId.length > 0) {
    return paramId;
  }

  const actor = (req as AuthenticatedRequest)[ARVEN_ACTOR_KEY];
  if (actor?.userId) {
    return actor.userId;
  }

  return 'none';
}

@Injectable()
export class AuditActionInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<AuditActionMetadata | undefined>(
      AUTH_METADATA_KEYS.AUDIT_ACTION,
      [context.getHandler(), context.getClass()],
    );

    if (!metadata) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return next.handle().pipe(
      mergeMap(async (responseData) => {
        if (wasAuditRecordedInTransaction(req)) {
          return responseData;
        }

        const actor = req[ARVEN_ACTOR_KEY];
        const safePayloadSummary =
          typeof req.body === 'object' && req.body !== null
            ? (scrubSensitiveMetadata({
                method: req.method,
                path: req.originalUrl ?? req.url,
                keys: Object.keys(req.body as Record<string, unknown>),
              }) as Record<string, unknown>)
            : { method: req.method, path: req.originalUrl ?? req.url };

        await this.auditLog.record({
          actorId: actor?.userId ?? null,
          actorRole: actor?.roles[0] ?? null,
          requestId: getRequestId() ?? null,
          action: metadata.action,
          resource: metadata.resource,
          resourceId: resolveResourceId(req, responseData),
          ipAddress: extractClientIp(req),
          afterState: safePayloadSummary,
        });

        return responseData;
      }),
    );
  }
}
