import {
  HttpStatus,
  SetMetadata,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type { PermissionCode, SessionScopeType } from '@arven/config';
import { DomainHttpException } from '../http/domain-http.exception.js';
import {
  ARVEN_ACTOR_KEY,
  type AuditActionMetadata,
  type AuthenticatedActor,
  type AuthenticatedRequest,
} from './types.js';

export const AUTH_METADATA_KEYS = {
  PUBLIC: 'arven:auth:public',
  AUTH_SCOPES: 'arven:auth:scopes',
  SKIP_MFA: 'arven:auth:skip_mfa',
  SKIP_CSRF: 'arven:auth:skip_csrf',
  PERMISSIONS_ALL: 'arven:auth:permissions_all',
  PERMISSIONS_ANY: 'arven:auth:permissions_any',
  MFA_STEP_UP_MAX_AGE_SECONDS: 'arven:auth:mfa_step_up_max_age_seconds',
  AUDIT_ACTION: 'arven:auth:audit_action',
  THROTTLE_EMAIL: 'arven:auth:throttle_email',
} as const;

export const Public = () => SetMetadata(AUTH_METADATA_KEYS.PUBLIC, true);

export const CustomerAuth = () =>
  SetMetadata(AUTH_METADATA_KEYS.AUTH_SCOPES, ['CUSTOMER'] satisfies SessionScopeType[]);

export const AdminAuth = () =>
  SetMetadata(AUTH_METADATA_KEYS.AUTH_SCOPES, ['ADMIN'] satisfies SessionScopeType[]);

export const PortalAuth = () =>
  SetMetadata(AUTH_METADATA_KEYS.AUTH_SCOPES, [
    'CUSTOMER',
    'ADMIN',
  ] satisfies SessionScopeType[]);

export const SkipMfaCheck = () => SetMetadata(AUTH_METADATA_KEYS.SKIP_MFA, true);

export const SkipCsrf = () => SetMetadata(AUTH_METADATA_KEYS.SKIP_CSRF, true);

export const RequirePermissions = (...codes: PermissionCode[]) =>
  SetMetadata(AUTH_METADATA_KEYS.PERMISSIONS_ALL, codes);

export const RequireAnyPermission = (...codes: PermissionCode[]) =>
  SetMetadata(AUTH_METADATA_KEYS.PERMISSIONS_ANY, codes);

export const RequireMfaStepUp = (maxAgeSeconds = 900) =>
  SetMetadata(AUTH_METADATA_KEYS.MFA_STEP_UP_MAX_AGE_SECONDS, maxAgeSeconds);

export const AuditAction = (action: string, resource: string) =>
  SetMetadata(AUTH_METADATA_KEYS.AUDIT_ACTION, {
    action,
    resource,
  } satisfies AuditActionMetadata);

export const ThrottleEmail = () => SetMetadata(AUTH_METADATA_KEYS.THROTTLE_EMAIL, true);

export const CurrentActor = createParamDecorator(
  (
    property: keyof AuthenticatedActor | undefined,
    ctx: ExecutionContext,
  ): AuthenticatedActor | AuthenticatedActor[keyof AuthenticatedActor] => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const actor = request[ARVEN_ACTOR_KEY];
    if (!actor) {
      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Authentication required',
      );
    }
    return property ? actor[property] : actor;
  },
);
