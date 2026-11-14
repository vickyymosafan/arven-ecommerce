import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_ROLE_CODES } from '@arven/config';
import { SessionScope } from '@arven/database';
import { patchRequestContext } from '@arven/observability';
import { DomainHttpException } from '../../http/domain-http.exception.js';
import { AUTH_METADATA_KEYS } from '../decorators.js';
import { SessionStoreService } from '../session-store.service.js';
import {
  ARVEN_ACTOR_KEY,
  ARVEN_RESOLVED_SESSION_KEY,
  type AuthenticatedRequest,
} from '../types.js';

const ADMIN_ROLE_SET = new Set<string>(ADMIN_ROLE_CODES);

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionStoreService) private readonly sessionStore: SessionStoreService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = Boolean(
      this.reflector.getAllAndOverride<boolean>(AUTH_METADATA_KEYS.PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
    if (isPublic) {
      return true;
    }

    const scopes = this.reflector.getAllAndOverride<SessionScope[]>(
      AUTH_METADATA_KEYS.AUTH_SCOPES,
      [context.getHandler(), context.getClass()],
    );

    if (!scopes || scopes.length === 0) {
      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Authentication required',
      );
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const resolved = await this.sessionStore.resolveFromRequest(req, scopes);
    if (!resolved) {
      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Invalid or expired session',
      );
    }

    if (
      resolved.actor.scope === SessionScope.ADMIN &&
      !resolved.actor.roles.some((role) => ADMIN_ROLE_SET.has(role))
    ) {
      throw new DomainHttpException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Admin role privileges are no longer active',
      );
    }

    req[ARVEN_ACTOR_KEY] = resolved.actor;
    req[ARVEN_RESOLVED_SESSION_KEY] = resolved;
    patchRequestContext({
      actorId: resolved.actor.userId,
      sessionId: resolved.actor.sessionId,
      sessionScope: resolved.actor.scope,
    });

    return true;
  }
}
