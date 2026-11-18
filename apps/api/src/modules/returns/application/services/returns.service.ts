import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DEFAULT_WAREHOUSE_CODE, HTTP_HEADERS } from '@arven/config';
import type { ReturnDetailDto } from '@arven/contracts';
import {
  OrderStatus,
  ReturnItemCondition,
  ReturnStatus,
  WarehouseStatus,
  type PrismaTransactionClient,
} from '@arven/database';
import type {
  AdminReturnsQuery,
  ApproveReturnRequest,
  CreateCustomerReturnRequest,
  ReceiveReturnRequest,
  ReviewReturnRequest,
} from '@arven/validators';
import {
  DomainHttpException,
  IdempotencyService,
  type IdempotencyResponseLike,
  type PaginatedResponse,
} from '../../../../common/http/index.js';
import {
  SessionScope,
  SessionStoreService,
  TokenCryptoService,
  extractClientIp,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../../../common/security/index.js';
import { PrismaService } from '../../../../shared/prisma/prisma.service.js';
import { AuditLogService } from '../../../audit-notifications/audit-log.service.js';
import { OutboxWriterService } from '../../../audit-notifications/outbox-writer.service.js';
import { InventoryService } from '../../../inventory/inventory.service.js';
import { OrderAccessService, OrdersService } from '../../../orders/index.js';
import {
  assertOrderEligibleForReturn,
  assertReturnApprovable,
  assertReturnReceivable,
  assertReturnReviewable,
  shouldRestockReturnItem,
  validateRequestedReturnItems,
} from '../../domain/entities/return.entity.js';
import { ReturnsDomainError } from '../../domain/errors/returns-domain.error.js';
import { RETURN_EVENT_TYPES } from '../../domain/events/returns.events.js';
import { ReturnsMapper } from '../../infrastructure/mappers/returns.mapper.js';
import { PrismaReturnsRepository } from '../../infrastructure/repositories/prisma-returns.repository.js';

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

function mapReturnsDomainError(error: unknown): never {
  if (error instanceof ReturnsDomainError) {
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
export class ReturnsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrismaReturnsRepository)
    private readonly returnsRepo: PrismaReturnsRepository,
    @Inject(ReturnsMapper) private readonly returnsMapper: ReturnsMapper,
    @Inject(OrderAccessService) private readonly orderAccess: OrderAccessService,
    @Inject(OrdersService) private readonly ordersService: OrdersService,
    @Inject(InventoryService) private readonly inventoryService: InventoryService,
    @Inject(IdempotencyService) private readonly idempotencyService: IdempotencyService,
    @Inject(OutboxWriterService) private readonly outboxWriter: OutboxWriterService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(SessionStoreService) private readonly sessionStore: SessionStoreService,
    @Inject(TokenCryptoService) private readonly tokenCrypto: TokenCryptoService,
  ) {}

  async createCustomerReturn(params: {
    req: HttpRequestLike;
    res: IdempotencyResponseLike;
    orderId: string;
    body: CreateCustomerReturnRequest;
    queryToken?: string;
  }): Promise<ReturnDetailDto> {
    const idempotencyKey = readIdempotencyKeyHeader(params.req);
    const credentials = await this.orderAccess.resolveRequiredCredentials(
      params.req,
      params.queryToken,
    );

    return this.idempotencyService.execute<ReturnDetailDto>({
      idempotencyKey,
      actorScope: credentials.actorScope,
      route: `POST:/api/v1/orders/${params.orderId}/returns`,
      requestPayload: {
        orderId: params.orderId,
        reason: params.body.reason,
        customerNotes: params.body.customerNotes ?? null,
        items: params.body.items,
      },
      res: params.res,
      successStatus: HttpStatus.CREATED,
      run: async (tx) => {
        const lockedOrder = await this.returnsRepo.lockOrderForReturn(
          tx,
          params.orderId,
        );
        const verified = this.orderAccess.assertOrderAccess(lockedOrder, credentials);
        if (verified.actorType === 'GUEST' && lockedOrder!.userId !== null) {
          throw new DomainHttpException(
            HttpStatus.FORBIDDEN,
            'RESOURCE_OWNERSHIP_DENIED',
            'Guest token cannot access a user-owned order',
          );
        }

        const deliveredAt = await this.returnsRepo.findOrderDeliveryTimestamp(
          tx,
          lockedOrder!.id,
          lockedOrder!.updatedAt,
        );

        try {
          assertOrderEligibleForReturn(lockedOrder!.status, deliveredAt, new Date());
        } catch (error) {
          mapReturnsDomainError(error);
        }

        const { orderItems, alreadyReturnedByOrderItemId } =
          await this.returnsRepo.findOrderItemsAndReturnedQuantities(tx, lockedOrder!.id);

        const orderItemsById = new Map(orderItems.map((item) => [item.id, item]));
        try {
          validateRequestedReturnItems(
            params.body.items,
            orderItemsById,
            alreadyReturnedByOrderItemId,
          );
        } catch (error) {
          mapReturnsDomainError(error);
        }

        const created = await this.returnsRepo.createReturnWithItems(tx, {
          orderId: lockedOrder!.id,
          userId: verified.actorId,
          reason: params.body.reason,
          customerNotes: params.body.customerNotes ?? null,
          items: params.body.items,
        });

        if (lockedOrder!.status === OrderStatus.DELIVERED) {
          await this.ordersService.transitionOrderStatusInTx(tx, {
            orderId: lockedOrder!.id,
            fromStatus: OrderStatus.DELIVERED,
            toStatus: OrderStatus.RETURN_REQUESTED,
            reason: `Return requested: ${params.body.reason}`,
            actorId: verified.actorId,
            actorType: verified.actorType,
          });
        }

        const totalQuantity = params.body.items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );

        await this.outboxWriter.enqueue(
          {
            aggregateType: 'return',
            aggregateId: created.id,
            eventType: RETURN_EVENT_TYPES.RETURN_REQUESTED,
            payload: {
              returnId: created.id,
              orderId: lockedOrder!.id,
              orderNumber: lockedOrder!.orderNumber,
              reason: params.body.reason,
              itemCount: params.body.items.length,
              totalQuantity,
            },
          },
          tx,
        );

        await this.auditLog.record(
          {
            actorId: verified.actorId,
            actorRole: verified.actorType,
            action: 'return.requested',
            resource: 'return',
            resourceId: created.id,
            ipAddress: extractClientIp(params.req),
            afterState: {
              orderId: lockedOrder!.id,
              status: ReturnStatus.REQUESTED,
              reason: params.body.reason,
              items: params.body.items,
            },
          },
          tx,
        );

        return this.returnsMapper.toReturnDetailDto(created, { piiMasked: false });
      },
    });
  }

  async listCustomerReturns(
    actor: AuthenticatedActor,
    query: { page: number; limit: number },
  ): Promise<PaginatedResponse<ReturnDetailDto>> {
    const { rows, total } = await this.returnsRepo.findManyByUserId({
      userId: actor.userId,
      page: query.page,
      limit: query.limit,
    });

    return {
      items: rows.map((row) =>
        this.returnsMapper.toReturnDetailDto(row, { piiMasked: false }),
      ),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async getReturnById(params: {
    req: HttpRequestLike;
    returnId: string;
    queryToken?: string;
  }): Promise<ReturnDetailDto> {
    const customerSession = await this.sessionStore.resolveFromRequest(params.req, [
      SessionScope.CUSTOMER,
    ]);
    const guestToken = this.orderAccess.extractGuestOrderToken(
      params.req,
      params.queryToken,
    );
    const adminSession =
      !customerSession && !guestToken
        ? await this.sessionStore.resolveFromRequest(params.req, [SessionScope.ADMIN])
        : null;

    if (!customerSession && !guestToken && !adminSession) {
      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'AUTHENTICATION_REQUIRED',
        'Authentication or X-Guest-Order-Token is required',
      );
    }

    if (adminSession) {
      if (adminSession.actor.mfaVerifiedAt === null) {
        throw new DomainHttpException(
          HttpStatus.UNAUTHORIZED,
          'MFA_REQUIRED',
          'Admin multi-factor authentication verification required',
        );
      }
      if (!adminSession.actor.permissions.includes('return.read')) {
        throw new DomainHttpException(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN',
          'Insufficient permissions to read returns',
        );
      }
    }

    const record = await this.returnsRepo.findDetailById(params.returnId);
    if (!record) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RETURN_NOT_FOUND',
        'Return request not found',
      );
    }

    if (adminSession) {
      const piiMasked = !adminSession.actor.permissions.includes('order.read');
      return this.returnsMapper.toReturnDetailDto(record, { piiMasked });
    }

    const isCustomerOwner =
      customerSession !== null &&
      (record.userId === customerSession.actor.userId ||
        record.order.userId === customerSession.actor.userId);

    let isGuestOwner = false;
    if (guestToken && record.order.userId === null && record.order.guestTokenHash) {
      const providedHash = this.tokenCrypto.sha256Hex(guestToken);
      isGuestOwner = this.tokenCrypto.timingSafeEqualUtf8(
        providedHash,
        record.order.guestTokenHash,
      );
    }

    if (!isCustomerOwner && !isGuestOwner) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RETURN_NOT_FOUND',
        'Return request not found',
      );
    }

    return this.returnsMapper.toReturnDetailDto(record, { piiMasked: false });
  }

  async listAdminReturns(
    actor: AuthenticatedActor,
    query: AdminReturnsQuery,
  ): Promise<PaginatedResponse<ReturnDetailDto>> {
    const piiMasked = !actor.permissions.includes('order.read');
    const { rows, total } = await this.returnsRepo.findManyAdmin({
      status: query.status as ReturnStatus | undefined,
      page: query.page,
      limit: query.limit,
    });

    return {
      items: rows.map((row) => this.returnsMapper.toReturnDetailDto(row, { piiMasked })),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async getAdminReturnById(
    actor: AuthenticatedActor,
    returnId: string,
  ): Promise<ReturnDetailDto> {
    const piiMasked = !actor.permissions.includes('order.read');
    const record = await this.returnsRepo.findDetailById(returnId);
    if (!record) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RETURN_NOT_FOUND',
        'Return request not found',
      );
    }

    return this.returnsMapper.toReturnDetailDto(record, { piiMasked });
  }

  async reviewReturn(params: {
    req: HttpRequestLike;
    actor: AuthenticatedActor;
    returnId: string;
    body: ReviewReturnRequest;
  }): Promise<ReturnDetailDto> {
    const { req, actor, returnId, body } = params;
    const piiMasked = !actor.permissions.includes('order.read');

    return this.prisma.withTransaction(async (tx) => {
      const locked = await this.returnsRepo.lockReturnForUpdate(tx, returnId);
      if (!locked) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RETURN_NOT_FOUND',
          'Return request not found',
        );
      }

      try {
        assertReturnReviewable(locked.status);
      } catch (error) {
        mapReturnsDomainError(error);
      }

      const now = new Date();
      await tx.return.update({
        where: { id: locked.id },
        data: {
          status: ReturnStatus.UNDER_REVIEW,
          reviewedBy: actor.userId,
          reviewedAt: now,
          ...(body.notes !== undefined ? { adminNotes: body.notes } : {}),
        },
      });

      await this.auditLog.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'ADMIN',
          action: 'return.reviewed',
          resource: 'return',
          resourceId: locked.id,
          ipAddress: extractClientIp(req),
          beforeState: { status: locked.status },
          afterState: {
            status: ReturnStatus.UNDER_REVIEW,
            reviewedBy: actor.userId,
            notes: body.notes ?? null,
          },
        },
        tx,
      );

      const refreshed = await this.returnsRepo.findDetailById(locked.id, tx);
      return this.returnsMapper.toReturnDetailDto(refreshed!, { piiMasked });
    });
  }

  async approveReturn(params: {
    req: HttpRequestLike;
    actor: AuthenticatedActor;
    returnId: string;
    body: ApproveReturnRequest;
  }): Promise<ReturnDetailDto> {
    const { req, actor, returnId, body } = params;
    const piiMasked = !actor.permissions.includes('order.read');

    return this.prisma.withTransaction(async (tx) => {
      const locked = await this.returnsRepo.lockReturnForUpdate(tx, returnId);
      if (!locked) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RETURN_NOT_FOUND',
          'Return request not found',
        );
      }

      try {
        assertReturnApprovable(locked.status, body.decision, body.adminNotes);
      } catch (error) {
        mapReturnsDomainError(error);
      }

      const lockedOrder = await this.ordersService.lockOrderInTx(tx, locked.orderId);
      if (!lockedOrder) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'ORDER_NOT_FOUND',
          'Parent order not found',
        );
      }

      const now = new Date();
      const targetReturnStatus =
        body.decision === 'APPROVE' ? ReturnStatus.APPROVED : ReturnStatus.REJECTED;

      await tx.return.update({
        where: { id: locked.id },
        data: {
          status: targetReturnStatus,
          reviewedBy: actor.userId,
          reviewedAt: now,
          ...(body.adminNotes !== undefined ? { adminNotes: body.adminNotes } : {}),
        },
      });

      let nextOrderStatus = lockedOrder.status;
      if (body.decision === 'APPROVE') {
        if (
          lockedOrder.status === OrderStatus.RETURN_REQUESTED ||
          lockedOrder.status === OrderStatus.DELIVERED
        ) {
          await this.ordersService.transitionOrderStatusInTx(tx, {
            orderId: lockedOrder.id,
            fromStatus: lockedOrder.status as OrderStatus,
            toStatus: OrderStatus.RETURN_APPROVED,
            reason: body.adminNotes ?? 'Return claim approved',
            actorId: actor.userId,
            actorType: 'ADMIN',
          });
          nextOrderStatus = OrderStatus.RETURN_APPROVED;
        }
      } else {
        const otherOpenReturns = await this.returnsRepo.countOtherOpenReturnsForOrder(
          tx,
          lockedOrder.id,
          locked.id,
        );
        if (
          otherOpenReturns === 0 &&
          lockedOrder.status === OrderStatus.RETURN_REQUESTED
        ) {
          await this.ordersService.transitionOrderStatusInTx(tx, {
            orderId: lockedOrder.id,
            fromStatus: OrderStatus.RETURN_REQUESTED,
            toStatus: OrderStatus.DELIVERED,
            reason: body.adminNotes ?? 'Return claim rejected',
            actorId: actor.userId,
            actorType: 'ADMIN',
          });
          nextOrderStatus = OrderStatus.DELIVERED;
        }
      }

      await this.auditLog.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'ADMIN',
          action: body.decision === 'APPROVE' ? 'return.approved' : 'return.rejected',
          resource: 'return',
          resourceId: locked.id,
          ipAddress: extractClientIp(req),
          beforeState: {
            status: locked.status,
            orderStatus: lockedOrder.status,
          },
          afterState: {
            status: targetReturnStatus,
            orderStatus: nextOrderStatus,
            reviewedBy: actor.userId,
            adminNotes: body.adminNotes ?? null,
          },
        },
        tx,
      );

      const refreshed = await this.returnsRepo.findDetailById(locked.id, tx);
      return this.returnsMapper.toReturnDetailDto(refreshed!, { piiMasked });
    });
  }

  async receiveReturn(params: {
    req: HttpRequestLike;
    res: IdempotencyResponseLike;
    actor: AuthenticatedActor;
    returnId: string;
    body: ReceiveReturnRequest;
  }): Promise<ReturnDetailDto> {
    const { req, res, actor, returnId, body } = params;
    const piiMasked = !actor.permissions.includes('order.read');

    const runReceive = async (tx: PrismaTransactionClient): Promise<ReturnDetailDto> => {
      const locked = await this.returnsRepo.lockReturnForUpdate(tx, returnId);
      if (!locked) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'RETURN_NOT_FOUND',
          'Return request not found',
        );
      }

      try {
        assertReturnReceivable(locked.status);
      } catch (error) {
        mapReturnsDomainError(error);
      }

      const lockedOrder = await this.ordersService.lockOrderInTx(tx, locked.orderId);
      if (!lockedOrder) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'ORDER_NOT_FOUND',
          'Parent order not found',
        );
      }

      const warehouseCode = body.warehouseCode ?? DEFAULT_WAREHOUSE_CODE;
      const warehouse = await tx.warehouse.findUnique({
        where: { code: warehouseCode },
      });
      if (!warehouse) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'WAREHOUSE_NOT_FOUND',
          `Warehouse "${warehouseCode}" was not found`,
        );
      }
      if (warehouse.status !== WarehouseStatus.ACTIVE) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'WAREHOUSE_INACTIVE',
          `Warehouse "${warehouseCode}" is not active`,
        );
      }

      const returnDetail = await this.returnsRepo.findDetailById(locked.id, tx);
      const returnItemsById = new Map(
        returnDetail!.items.map((item) => [item.id, item]),
      );

      for (const inspected of body.items) {
        if (!returnItemsById.has(inspected.returnItemId)) {
          throw new DomainHttpException(
            HttpStatus.BAD_REQUEST,
            'VALIDATION_ERROR',
            `Return item ${inspected.returnItemId} does not belong to return ${locked.id}`,
            [{ field: 'items.returnItemId', issue: 'Unknown returnItemId' }],
          );
        }
      }

      const inspectionSummary: Array<{
        returnItemId: string;
        variantId: string | null;
        condition: string;
        quantity: number;
        restocked: boolean;
      }> = [];

      for (const inspected of body.items) {
        const returnItem = returnItemsById.get(inspected.returnItemId)!;

        await this.returnsRepo.updateReturnItemInspectionCondition(
          tx,
          returnItem.id,
          inspected.condition as ReturnItemCondition,
        );

        let didRestock = false;
        if (
          shouldRestockReturnItem({
            condition: inspected.condition,
            restock: inspected.restock,
            variantId: returnItem.orderItem.variantId,
            alreadyRestocked: returnItem.restocked,
          })
        ) {
          const marked = await this.returnsRepo.markReturnItemRestockedIfUnrestocked(
            tx,
            returnItem.id,
          );
          if (!marked) {
            throw new DomainHttpException(
              HttpStatus.CONFLICT,
              'RETURN_ITEM_ALREADY_RESTOCKED',
              `Return item ${returnItem.id} was already restocked`,
            );
          }

          await this.inventoryService.returnStockFromInspection(tx, {
            warehouseId: warehouse.id,
            variantId: returnItem.orderItem.variantId!,
            quantity: returnItem.quantity,
            returnId: locked.id,
            actorId: actor.userId,
            reason: `Return inspection passed (${inspected.condition})`,
          });
          didRestock = true;
        }

        inspectionSummary.push({
          returnItemId: returnItem.id,
          variantId: returnItem.orderItem.variantId,
          condition: inspected.condition,
          quantity: returnItem.quantity,
          restocked: didRestock,
        });
      }

      const now = new Date();
      await tx.return.update({
        where: { id: locked.id },
        data: {
          status: ReturnStatus.RECEIVED,
          receivedAt: now,
          ...(body.adminNotes !== undefined ? { adminNotes: body.adminNotes } : {}),
        },
      });

      let nextOrderStatus = lockedOrder.status;
      if (
        lockedOrder.status === OrderStatus.RETURN_APPROVED ||
        lockedOrder.status === OrderStatus.RETURN_REQUESTED ||
        lockedOrder.status === OrderStatus.DELIVERED
      ) {
        await this.ordersService.transitionOrderStatusInTx(tx, {
          orderId: lockedOrder.id,
          fromStatus: lockedOrder.status as OrderStatus,
          toStatus: OrderStatus.RETURNED,
          reason: body.adminNotes ?? 'Return items physically received and inspected',
          actorId: actor.userId,
          actorType: 'ADMIN',
        });
        nextOrderStatus = OrderStatus.RETURNED;
      }

      await this.auditLog.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'ADMIN',
          action: 'return.received',
          resource: 'return',
          resourceId: locked.id,
          ipAddress: extractClientIp(req),
          beforeState: {
            status: locked.status,
            orderStatus: lockedOrder.status,
          },
          afterState: {
            status: ReturnStatus.RECEIVED,
            orderStatus: nextOrderStatus,
            warehouseCode: warehouse.code,
            items: inspectionSummary,
          },
        },
        tx,
      );

      const refreshed = await this.returnsRepo.findDetailById(locked.id, tx);
      return this.returnsMapper.toReturnDetailDto(refreshed!, { piiMasked });
    };

    const idempotencyKey = readOptionalIdempotencyKeyHeader(req);
    if (idempotencyKey) {
      return this.idempotencyService.execute<ReturnDetailDto>({
        idempotencyKey,
        actorScope: `admin:${actor.userId}`,
        route: `POST:/api/v1/admin/returns/${returnId}/receive`,
        requestPayload: {
          returnId,
          warehouseCode: body.warehouseCode ?? DEFAULT_WAREHOUSE_CODE,
          adminNotes: body.adminNotes ?? null,
          items: body.items,
        },
        res,
        successStatus: HttpStatus.OK,
        run: runReceive,
      });
    }

    return this.prisma.withTransaction(runReceive);
  }
}
