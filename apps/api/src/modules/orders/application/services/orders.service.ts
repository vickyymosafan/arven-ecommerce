import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { HTTP_HEADERS } from '@arven/config';
import type { OrderDetailDto, OrderSummaryDto } from '@arven/contracts';
import { OrderStatus } from '@arven/database';
import type { CancelOrderRequest, ListOrdersQuery } from '@arven/validators';
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
import { AuditLogService } from '../../../audit-notifications/audit-log.service.js';
import { OutboxWriterService } from '../../../audit-notifications/outbox-writer.service.js';
import { InventoryReservationService } from '../../../inventory/inventory-reservation.service.js';
import { assertOrderCancellable } from '../../domain/entities/order.entity.js';
import { OrdersDomainError } from '../../domain/errors/orders-domain.error.js';
import { ORDER_EVENT_TYPES } from '../../domain/events/orders.events.js';
import { OrdersMapper } from '../../infrastructure/mappers/orders.mapper.js';
import { PrismaOrdersRepository } from '../../infrastructure/repositories/prisma-orders.repository.js';
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

@Injectable()
export class OrdersService {
  constructor(
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
}
