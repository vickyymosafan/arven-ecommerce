import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { HTTP_HEADERS } from '@arven/config';
import { DomainHttpException } from '../../../../common/http/index.js';
import {
  SessionScope,
  SessionStoreService,
  TokenCryptoService,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../../../common/security/index.js';
import type {
  OrderAccessDescriptor,
  VerifiedOrderActor,
} from '../../domain/ports/orders.ports.js';

export interface ResolvedOrderCredentials {
  customerActor: AuthenticatedActor | null;
  guestToken: string | null;
  actorScope: string;
}

@Injectable()
export class OrderAccessService {
  constructor(
    @Inject(SessionStoreService)
    private readonly sessionStore: SessionStoreService,
    @Inject(TokenCryptoService)
    private readonly tokenCrypto: TokenCryptoService,
  ) {}

  async resolveOptionalCustomer(req: HttpRequestLike): Promise<AuthenticatedActor | null> {
    const resolved = await this.sessionStore.resolveFromRequest(req, [SessionScope.CUSTOMER]);
    if (resolved && resolved.actor.scope === SessionScope.CUSTOMER) {
      return resolved.actor;
    }
    return null;
  }

  extractGuestOrderToken(req: HttpRequestLike, queryToken?: string): string | null {
    const headerVal = req.headers[HTTP_HEADERS.GUEST_ORDER_TOKEN];
    const fromHeader =
      typeof headerVal === 'string'
        ? headerVal.trim()
        : Array.isArray(headerVal) && typeof headerVal[0] === 'string'
          ? headerVal[0].trim()
          : '';
    if (fromHeader.length > 0) {
      return fromHeader;
    }

    if (typeof queryToken === 'string' && queryToken.trim().length > 0) {
      return queryToken.trim();
    }

    return null;
  }

  async resolveRequiredCredentials(
    req: HttpRequestLike,
    queryToken?: string,
  ): Promise<ResolvedOrderCredentials> {
    const customerActor = await this.resolveOptionalCustomer(req);
    const guestToken = this.extractGuestOrderToken(req, queryToken);

    if (!customerActor && !guestToken) {
      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'AUTHENTICATION_REQUIRED',
        'Customer authentication or X-Guest-Order-Token is required',
      );
    }

    const actorScope = customerActor
      ? `user:${customerActor.userId}`
      : `guest:${this.tokenCrypto.sha256Hex(guestToken!).slice(0, 24)}`;

    return {
      customerActor,
      guestToken,
      actorScope,
    };
  }

  assertOrderAccess(
    order: OrderAccessDescriptor | null,
    credentials: ResolvedOrderCredentials,
  ): VerifiedOrderActor {
    if (!order) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'ORDER_NOT_FOUND',
        'Order not found',
      );
    }

    if (credentials.customerActor && order.userId === credentials.customerActor.userId) {
      return {
        actorType: 'CUSTOMER',
        actorId: credentials.customerActor.userId,
        actorScope: credentials.actorScope,
      };
    }

    if (credentials.guestToken && order.guestTokenHash) {
      const providedHash = this.tokenCrypto.sha256Hex(credentials.guestToken);
      if (this.tokenCrypto.timingSafeEqualUtf8(providedHash, order.guestTokenHash)) {
        return {
          actorType: 'GUEST',
          actorId: null,
          actorScope: credentials.actorScope,
        };
      }
    }

    throw new DomainHttpException(
      HttpStatus.NOT_FOUND,
      'ORDER_NOT_FOUND',
      'Order not found',
    );
  }
}
