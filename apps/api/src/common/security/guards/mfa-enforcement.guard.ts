import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionScope } from '@arven/database';
import { DomainHttpException } from '../../http/domain-http.exception.js';
import { AUTH_METADATA_KEYS } from '../decorators.js';
import { ARVEN_ACTOR_KEY, type AuthenticatedRequest } from '../types.js';

@Injectable()
export class MfaEnforcementGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = Boolean(
      this.reflector.getAllAndOverride<boolean>(AUTH_METADATA_KEYS.PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actor = req[ARVEN_ACTOR_KEY];
    if (!actor) {
      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Authentication required',
      );
    }

    if (actor.scope !== SessionScope.ADMIN) {
      return true;
    }

    const skipMfa = Boolean(
      this.reflector.getAllAndOverride<boolean>(AUTH_METADATA_KEYS.SKIP_MFA, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
    if (!skipMfa && actor.mfaVerifiedAt === null) {
      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'MFA_REQUIRED',
        'Admin multi-factor authentication verification required',
      );
    }

    const stepUpMaxAgeSeconds = this.reflector.getAllAndOverride<number>(
      AUTH_METADATA_KEYS.MFA_STEP_UP_MAX_AGE_SECONDS,
      [context.getHandler(), context.getClass()],
    );

    if (typeof stepUpMaxAgeSeconds === 'number') {
      if (actor.mfaVerifiedAt === null) {
        throw new DomainHttpException(
          HttpStatus.UNAUTHORIZED,
          'MFA_REQUIRED',
          'Admin multi-factor authentication verification required',
        );
      }

      const ageMs = Date.now() - actor.mfaVerifiedAt.getTime();
      if (ageMs > stepUpMaxAgeSeconds * 1000) {
        throw new DomainHttpException(
          HttpStatus.FORBIDDEN,
          'MFA_STEP_UP_REQUIRED',
          'Recent MFA verification required for this privileged action',
        );
      }
    }

    return true;
  }
}
