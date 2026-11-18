import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { HTTP_HEADERS } from '@arven/config';
import type {
  AdminOrderDetailDto,
  AdminOrderSummaryDto,
  OrderDetailDto,
  OrderSummaryDto,
} from '@arven/contracts';
import { OrderStatus, type PrismaTransactionClient } from '@arven/database';
import type {
  AdminOrdersQuery,
  AdminTransitionOrderRequest,
  CancelOrderRequest,
  ListOrdersQuery,
} from '@arven/validators';
import {
  DomainHttpException,
  IdempotencyService,
  type IdempotencyResponseLike,
  type PaginatedResponse,
} from '../../../../common/http/index.js';
import {
  extractClientIp,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../../../common/security/index.js';
import { PrismaService } from '../../../../shared/prisma/prisma.service.js';
import { AuditLogService } from '../../../audit-notifications/audit-log.service.js';
import { OutboxWriterService } from '../../../audit-notifications/outbox-writer.service.js';
import { InventoryReservationService } from '../../../inventory/inventory-reservation.service.js';
import {
  assertAdminOrderTransition,
  assertOrderCancellable,
  isAdminFulfillmentTarget,
  isPostShipmentProtectedStatus,
} from '../../domain/entities/order.entity.js';
import { OrdersDomainError } from '../../domain/errors/orders-domain.error.js';
import { ORDER_EVENT_TYPES } from '../../domain/events/orders.events.js';
import { OrdersMapper } from '../../infrastructure/mappers/orders.mapper.js';
import {
  PrismaOrdersRepository,
  type LockedOrderRow,
} from '../../infrastructure/repositories/prisma-orders.repository.js';
import { OrderAccessService } from './order-access.service.js';

function readIdempotencyKeyHeader(req: HttpRequestLike): string {
  const raw = req.headers[HTTP_HEADERS.IDEMPOTENCY_KEY];
  const value =
    typeof raw === 'string'
      ? raw.trim()
      : Array.isArray(raw) && typeof raw[0] === 'string'
        ? raw[0].trim()
        : '';

  if (value.length < 8 || value.length > 128) {
    throw new DomainHttpException(
      HttpStatus.BAD_REQUEST,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key header (8..128 characters) is required for this operation',
    );
  }
  return value;
}

function readOptionalIdempotencyKeyHeader(req: HttpRequestLike): string | undefined {
  const raw = req.headers[HTTP_HEADERS.IDEMPOTENCY_KEY];
  const value =
    typeof raw === 'string'
      ? raw.trim()
      : Array.isArray(raw) && typeof raw[0] === 'string'
        ? raw[0].trim()
        : '';
  return value.length > 0 ? value : undefined;
}

function mapOrdersDomainError(error: unknown): never {
  if (error instanceof OrdersDomainError) {
    throw new DomainHttpException(
      error.statusCode,
      error.code,
      error.message,
      error.details,
    );
  }
  throw error;
}

@Injectable()
export class OrdersService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(PrismaOrdersRepository)
    private readonly ordersRepo: PrismaOrdersRepository,
    @Inject(OrdersMapper)
    private readonly mapper: OrdersMapper,
    @Inject(OrderAccessService)
    private readonly orderAccess: OrderAccessService,
    @Inject(InventoryReservationService)
    private readonly inventoryReservation: InventoryReservationService,
    @Inject(IdempotencyService)
    private readonly idempotencyService: IdempotencyService,
    @Inject(OutboxWriterService)
    private readonly outboxWriter: OutboxWriterService,
    @Inject(AuditLogService)
    private readonly auditLog: AuditLogService,
  ) {}

  async listCustomerOrders(
    actor: AuthenticatedActor,
    query: ListOrdersQuery,
  ): Promise<PaginatedResponse<OrderSummaryDto>> {
    const { orders, total } = await this.ordersRepo.findManyByUserId({
      userId: actor.userId,
      status: query.status as OrderStatus | undefined,
      page: query.page,
      limit: query.limit,
    });

    return {
      items: orders.map((order) => this.mapper.toOrderSummaryDto(order)),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async getOrderByNumber(params: {
    req: HttpRequestLike;
    orderNumber: string;
    queryToken?: string;
  }): Promise<OrderDetailDto> {
    const credentials = await this.orderAccess.resolveRequiredCredentials(
      params.req,
      params.queryToken,
    );

    const order = await this.ordersRepo.findDetailByOrderNumber(params.orderNumber);
    this.orderAccess.assertOrderAccess(order, credentials);

    return this.mapper.toOrderDetailDto(order!);
  }

  async cancelOrder(params: {
    req: HttpRequestLike;
    res: IdempotencyResponseLike;
    orderId: string;
    body: CancelOrderRequest;
    queryToken?: string;
  }): Promise<OrderDetailDto> {
    const idempotencyKey = readIdempotencyKeyHeader(params.req);
    const credentials = await this.orderAccess.resolveRequiredCredentials(
      params.req,
      params.queryToken,
    );

    const reason = params.body.reason?.trim() || 'Cancelled by customer';

    return this.idempotencyService.execute<OrderDetailDto>({
      idempotencyKey,
      actorScope: credentials.actorScope,
      route: `POST:/api/v1/orders/${params.orderId}/cancel`,
      requestPayload: {
        orderId: params.orderId,
        reason,
      },
      res: params.res,
      successStatus: HttpStatus.OK,
      run: async (tx) => {
        const locked = await this.ordersRepo.lockOrderForUpdate(tx, params.orderId);
        const verified = this.orderAccess.assertOrderAccess(locked, credentials);

        try {
          assertOrderCancellable(locked!.status);
        } catch (error) {
          mapOrdersDomainError(error);
        }

        await this.ordersRepo.markOrderCancelled(tx, {
          orderId: locked!.id,
          fromStatus: locked!.status as OrderStatus,
          reason,
          actorId: verified.actorId,
          actorType: verified.actorType,
        });

        const releasedReservationsCount =
          await this.inventoryReservation.releaseOrderReservations(tx, {
            orderId: locked!.id,
            targetStatus: 'RELEASED',
            actorId: verified.actorId,
            reason,
          });

        await this.outboxWriter.enqueue(
          {
            aggregateType: 'order',
            aggregateId: locked!.id,
            eventType: ORDER_EVENT_TYPES.INVENTORY_RELEASED,
            payload: {
              orderId: locked!.id,
              orderNumber: locked!.orderNumber,
              targetStatus: 'RELEASED',
              releasedReservationsCount,
              reason,
            },
          },
          tx,
        );

        await this.auditLog.record(
          {
            actorId: verified.actorId,
            actorRole: verified.actorType,
            action: 'order.cancelled',
            resource: 'order',
            resourceId: locked!.id,
            ipAddress: extractClientIp(params.req),
            beforeState: { status: locked!.status },
            afterState: {
              status: OrderStatus.CANCELLED,
              releasedReservationsCount,
            },
          },
          tx,
        );

        const refreshed = await this.ordersRepo.findDetailById(locked!.id, tx);
        return this.mapper.toOrderDetailDto(refreshed!);
      },
    });
  }

  async listAdminOrders(
    actor: AuthenticatedActor,
    query: AdminOrdersQuery,
  ): Promise<PaginatedResponse<AdminOrderSummaryDto>> {
    const piiMasked = !actor.permissions.includes('order.read');
    const { orders, total } = await this.ordersRepo.findManyAdmin({
      status: query.status as OrderStatus | undefined,
      q: query.q,
      page: query.page,
      limit: query.limit,
    });

    return {
      items: orders.map((order) =>
        this.mapper.toAdminOrderSummaryDto(order, { piiMasked }),
      ),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async getAdminOrderById(
    actor: AuthenticatedActor,
    orderId: string,
  ): Promise<AdminOrderDetailDto> {
    const piiMasked = !actor.permissions.includes('order.read');
    const order = await this.ordersRepo.findAdminDetailById(orderId);
    if (!order) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'ORDER_NOT_FOUND',
        'Order not found',
      );
    }

    return this.mapper.toAdminOrderDetailDto(order, { piiMasked });
  }

  async transitionAdminOrder(params: {
    req: HttpRequestLike;
    res: IdempotencyResponseLike;
    actor: AuthenticatedActor;
    orderId: string;
    body: AdminTransitionOrderRequest;
  }): Promise<AdminOrderDetailDto> {
    const { req, res, actor, orderId, body } = params;

    if (body.toStatus === 'CANCELLED') {
      if (!actor.permissions.includes('order.cancel')) {
        throw new DomainHttpException(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN',
          'Insufficient permissions to cancel orders',
        );
      }
    } else if (isAdminFulfillmentTarget(body.toStatus)) {
      if (!actor.permissions.includes('order.fulfill')) {
        throw new DomainHttpException(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN',
          'Insufficient permissions to fulfill orders',
        );
      }
    } else {
      throw new DomainHttpException(
        HttpStatus.CONFLICT,
        'INVALID_STATE_TRANSITION',
        `Target status ${body.toStatus} cannot be set via admin order transition`,
      );
    }

    const reason =
      body.reason?.trim() ||
      (body.toStatus === 'CANCELLED'
        ? 'Cancelled by admin operator'
        : `Transitioned to ${body.toStatus}`);

    const runTransition = async (tx: PrismaTransactionClient): Promise<AdminOrderDetailDto> => {
      const locked = await this.ordersRepo.lockOrderForUpdate(tx, orderId);
      if (!locked) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'ORDER_NOT_FOUND',
          'Order not found',
        );
      }

      if (
        body.toStatus === 'CANCELLED' &&
        isPostShipmentProtectedStatus(locked.status) &&
        !actor.permissions.includes('order.fulfill')
      ) {
        throw new DomainHttpException(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN',
          `Support role cannot cancel order in ${locked.status} status`,
        );
      }

      try {
        assertAdminOrderTransition(locked.status, body.toStatus);
      } catch (error) {
        mapOrdersDomainError(error);
      }

      let releasedReservationsCount = 0;

      if (body.toStatus === 'CANCELLED') {
        await this.ordersRepo.markOrderCancelled(tx, {
          orderId: locked.id,
          fromStatus: locked.status as OrderStatus,
          reason,
          actorId: actor.userId,
          actorType: 'ADMIN',
        });

        releasedReservationsCount =
          await this.inventoryReservation.releaseOrderReservations(tx, {
            orderId: locked.id,
            targetStatus: 'RELEASED',
            actorId: actor.userId,
            reason,
          });

        if (releasedReservationsCount > 0) {
          await this.outboxWriter.enqueue(
            {
              aggregateType: 'order',
              aggregateId: locked.id,
              eventType: ORDER_EVENT_TYPES.INVENTORY_RELEASED,
              payload: {
                orderId: locked.id,
                orderNumber: locked.orderNumber,
                targetStatus: 'RELEASED',
                releasedReservationsCount,
                reason,
              },
            },
            tx,
          );
        }

        await this.outboxWriter.enqueue(
          {
            aggregateType: 'order',
            aggregateId: locked.id,
            eventType: ORDER_EVENT_TYPES.ORDER_CANCELLED,
            payload: {
              orderId: locked.id,
              orderNumber: locked.orderNumber,
              reason,
              releasedReservationsCount,
            },
          },
          tx,
        );
      } else {
        await this.ordersRepo.transitionOrderStatusInTx(tx, {
          orderId: locked.id,
          fromStatus: locked.status as OrderStatus,
          toStatus: body.toStatus as OrderStatus,
          reason,
          actorId: actor.userId,
          actorType: 'ADMIN',
        });

        if (body.toStatus === 'READY_TO_SHIP') {
          await this.outboxWriter.enqueue(
            {
              aggregateType: 'order',
              aggregateId: locked.id,
              eventType: ORDER_EVENT_TYPES.ORDER_READY_TO_SHIP,
              payload: {
                orderId: locked.id,
                orderNumber: locked.orderNumber,
              },
            },
            tx,
          );
        }
      }

      await this.auditLog.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'ADMIN',
          action:
            body.toStatus === 'CANCELLED'
              ? 'order.cancelled'
              : 'order.status_transitioned',
          resource: 'order',
          resourceId: locked.id,
          ipAddress: extractClientIp(req),
          beforeState: { status: locked.status },
          afterState: {
            status: body.toStatus,
            reason,
            releasedReservationsCount,
          },
        },
        tx,
      );

      const refreshed = await this.ordersRepo.findAdminDetailById(locked.id, tx);
      const piiMasked = !actor.permissions.includes('order.read');
      return this.mapper.toAdminOrderDetailDto(refreshed!, { piiMasked });
    };

    const idempotencyKey = readOptionalIdempotencyKeyHeader(req);
    if (idempotencyKey) {
      return this.idempotencyService.execute<AdminOrderDetailDto>({
        idempotencyKey,
        actorScope: `admin:${actor.userId}`,
        route: `POST:/api/v1/admin/orders/${orderId}/transition`,
        requestPayload: {
          orderId,
          toStatus: body.toStatus,
          reason,
        },
        res,
        successStatus: HttpStatus.OK,
        run: runTransition,
      });
    }

    return this.prisma.withTransaction(runTransition);
  }

  /**
   * Shared transactional order helpers exported for ShippingModule & ReturnsModule.
   */
  async lockOrderInTx(
    tx: PrismaTransactionClient,
    orderId: string,
  ): Promise<LockedOrderRow | null> {
    return this.ordersRepo.lockOrderForUpdate(tx, orderId);
  }

  async transitionOrderStatusInTx(
    tx: PrismaTransactionClient,
    params: {
      orderId: string;
      fromStatus: OrderStatus;
      toStatus: OrderStatus;
      reason: string | null;
      actorId: string | null;
      actorType: 'CUSTOMER' | 'GUEST' | 'ADMIN' | 'WORKER' | 'WEBHOOK';
    },
  ): Promise<void> {
    return this.ordersRepo.transitionOrderStatusInTx(tx, params);
  }
}
