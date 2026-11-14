import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HTTP_HEADERS, type RuntimeConfig } from '@arven/config';
import { SessionScope } from '@arven/database';
import { DomainHttpException } from '../../http/domain-http.exception.js';
import { RUNTIME_CONFIG } from '../../../shared/config/config.module.js';
import { AUTH_METADATA_KEYS } from '../decorators.js';
import { SessionStoreService } from '../session-store.service.js';
import { TokenCryptoService } from '../token-crypto.service.js';
import {
  getRequestOrigin,
  parseCookiesFromRequest,
  type HttpRequestLike,
} from '../types.js';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RUNTIME_CONFIG) config: RuntimeConfig,
    @Inject(SessionStoreService) private readonly sessionStore: SessionStoreService,
    @Inject(TokenCryptoService) private readonly tokenCrypto: TokenCryptoService,
  ) {
    this.allowedOrigins = new Set(
      config.CORS_ALLOWED_ORIGINS.map((origin) => {
        try {
          return new URL(origin).origin;
        } catch {
          return origin;
        }
      }),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<HttpRequestLike>();

    if (SAFE_HTTP_METHODS.has(req.method.toUpperCase())) {
      return true;
    }

    const skipCsrf = Boolean(
      this.reflector.getAllAndOverride<boolean>(AUTH_METADATA_KEYS.SKIP_CSRF, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
    if (skipCsrf) {
      return true;
    }

    if (req.headers.origin !== undefined || req.headers.referer !== undefined) {
      const origin = getRequestOrigin(req);
      if (!origin || !this.allowedOrigins.has(origin)) {
        throw new DomainHttpException(
          HttpStatus.FORBIDDEN,
          'CSRF_INVALID',
          'Untrusted request origin',
        );
      }
    }

    const rawHeaderToken = req.headers[HTTP_HEADERS.CSRF_TOKEN];
    const headerToken = (
      Array.isArray(rawHeaderToken) ? rawHeaderToken[0] : rawHeaderToken
    )?.trim();

    if (!headerToken) {
      throw new DomainHttpException(
        HttpStatus.FORBIDDEN,
        'CSRF_INVALID',
        'Missing CSRF token header',
      );
    }

    const isPublic = Boolean(
      this.reflector.getAllAndOverride<boolean>(AUTH_METADATA_KEYS.PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
    const routeScopes = this.reflector.getAllAndOverride<SessionScope[]>(
      AUTH_METADATA_KEYS.AUTH_SCOPES,
      [context.getHandler(), context.getClass()],
    );

    const lookupScopes: SessionScope[] =
      !isPublic && routeScopes && routeScopes.length > 0
        ? routeScopes
        : [SessionScope.CUSTOMER, SessionScope.ADMIN];

    const resolvedSession = await this.sessionStore.resolveFromRequest(req, lookupScopes);

    if (resolvedSession) {
      if (
        this.tokenCrypto.verifySessionCsrfToken(resolvedSession.csrfSecret, headerToken)
      ) {
        return true;
      }

      if (!isPublic) {
        throw new DomainHttpException(
          HttpStatus.FORBIDDEN,
          'CSRF_INVALID',
          'Invalid CSRF token for active session',
        );
      }
    }

    const cookies = parseCookiesFromRequest(req);
    const preAuthCookieValue = cookies[this.sessionStore.getPreAuthCsrfCookieName()];
    if (this.tokenCrypto.verifyPreAuthCsrf(preAuthCookieValue, headerToken)) {
      return true;
    }

    throw new DomainHttpException(
      HttpStatus.FORBIDDEN,
      'CSRF_INVALID',
      'Invalid or expired CSRF token',
    );
  }
}
