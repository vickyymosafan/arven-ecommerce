import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { DomainHttpException } from '../../http/domain-http.exception.js';
import { AUTH_METADATA_KEYS } from '../decorators.js';
import {
  extractClientIp,
  parseCookiesFromRequest,
  type HttpRequestLike,
} from '../types.js';

const ACCOUNT_THROTTLED_SUFFIXES = [
  '/auth/login',
  '/auth/admin/login',
  '/auth/forgot-password',
  '/auth/mfa/verify',
] as const;

function sha256Short(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 32);
}

@Injectable()
export class ArvenThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    @Inject(Reflector) reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    return extractClientIp(req as unknown as HttpRequestLike) ?? 'unknown';
  }

  private extractAccountTracker(
    context: ExecutionContext,
    req: HttpRequestLike,
  ): string | null {
    const hasEmailMetadata = Boolean(
      this.reflector.getAllAndOverride<boolean>(AUTH_METADATA_KEYS.THROTTLE_EMAIL, [
        context.getHandler(),
        context.getClass(),
      ]),
    );

    const requestPath = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
    const isAuthAccountEndpoint =
      hasEmailMetadata ||
      ACCOUNT_THROTTLED_SUFFIXES.some((suffix) => requestPath.endsWith(suffix));

    if (!isAuthAccountEndpoint) {
      return null;
    }

    const body = req.body as Record<string, unknown> | undefined;
    if (body && typeof body['email'] === 'string' && body['email'].trim().length > 0) {
      const normalizedEmail = body['email'].trim().toLowerCase();
      return `email:${sha256Short(normalizedEmail)}`;
    }

    if (requestPath.endsWith('/auth/mfa/verify')) {
      const cookies = parseCookiesFromRequest(req);
      const tokenCandidate = Object.entries(cookies)
        .filter(([name]) => name.includes('sid'))
        .map(([, val]) => val)
        .find((val) => val.length > 0);
      if (tokenCandidate) {
        return `session:${sha256Short(tokenCandidate)}`;
      }
    }

    return null;
  }

  protected override async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const allowedByIp = await super.handleRequest(requestProps);
    if (!allowedByIp) {
      return false;
    }

    const { context, limit, ttl, throttler, blockDuration, generateKey } = requestProps;
    const { req, res } = this.getRequestResponse(context);
    const accountTracker = this.extractAccountTracker(
      context,
      req as unknown as HttpRequestLike,
    );

    if (!accountTracker) {
      return true;
    }

    const throttlerName = throttler.name ?? 'default';
    const key = generateKey(context, accountTracker, throttlerName);
    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );

    const suffix = throttlerName === 'default' ? '' : `-${throttlerName}`;

    if (isBlocked) {
      this.setResponseHeader(res, `Retry-After${suffix}`, timeToBlockExpire);
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker: accountTracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      });
    }

    this.setResponseHeader(res, `${this.headerPrefix}-Limit${suffix}`, limit);
    this.setResponseHeader(
      res,
      `${this.headerPrefix}-Remaining${suffix}`,
      Math.max(0, limit - totalHits),
    );
    this.setResponseHeader(res, `${this.headerPrefix}-Reset${suffix}`, timeToExpire);
    return true;
  }

  protected override async throwThrottlingException(
    _context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryAfterSeconds = Math.max(
      1,
      throttlerLimitDetail.timeToBlockExpire || throttlerLimitDetail.timeToExpire,
    );
    throw new DomainHttpException(
      HttpStatus.TOO_MANY_REQUESTS,
      'RATE_LIMITED',
      `Too many requests. Retry after ${retryAfterSeconds} seconds`,
    );
  }
}
