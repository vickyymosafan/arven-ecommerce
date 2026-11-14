import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionCode } from '@arven/config';
import { DomainHttpException } from '../../http/domain-http.exception.js';
import { AUTH_METADATA_KEYS } from '../decorators.js';
import { ARVEN_ACTOR_KEY, type AuthenticatedRequest } from '../types.js';

@Injectable()
export class PermissionGuard implements CanActivate {
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

    const requiredAll =
      this.reflector.getAllAndOverride<PermissionCode[]>(
        AUTH_METADATA_KEYS.PERMISSIONS_ALL,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    const requiredAny =
      this.reflector.getAllAndOverride<PermissionCode[]>(
        AUTH_METADATA_KEYS.PERMISSIONS_ANY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    const requestPath = (req.originalUrl ?? req.url ?? req.path ?? '').split('?')[0] ?? '';
    const isAdminRoute = /(?:^|\/)admin(?:\/|$)/.test(requestPath);

    if (isAdminRoute && requiredAll.length === 0 && requiredAny.length === 0) {
      throw new DomainHttpException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Missing permission metadata on admin endpoint',
      );
    }

    if (requiredAll.length === 0 && requiredAny.length === 0) {
      return true;
    }

    const granted = new Set<PermissionCode>(actor.permissions);

    if (requiredAll.length > 0 && !requiredAll.every((code) => granted.has(code))) {
      throw new DomainHttpException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Insufficient permissions',
      );
    }

    if (requiredAny.length > 0 && !requiredAny.some((code) => granted.has(code))) {
      throw new DomainHttpException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Insufficient permissions',
      );
    }

    return true;
  }
}
