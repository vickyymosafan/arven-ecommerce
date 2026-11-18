import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { HTTP_HEADERS, SHIPPING_POLICY } from '@arven/config';
import type { ShipmentDto } from '@arven/contracts';
import {
  OrderStatus,
  ShipmentStatus,
  WarehouseStatus,
  type PrismaTransactionClient,
} from '@arven/database';
import type { AdminCreateShipmentRequest } from '@arven/validators';
import {
  DomainHttpException,
  IdempotencyService,
  type IdempotencyResponseLike,
} from '../../common/http/index.js';
import {
  extractClientIp,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../common/security/index.js';
import {
  SHIPPING_PROVIDER,
  type ShippingProvider,
  type TrackingSnapshot,
} from '../../shared/adapters/shipping.provider.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { AuditLogService } from '../audit-notifications/audit-log.service.js';
import { OutboxWriterService } from '../audit-notifications/outbox-writer.service.js';
import { OrdersService, readAddressSnapshot } from '../orders/index.js';
import { ShippingMapper } from './shipping.mapper.js';

const SHIPPABLE_ORDER_STATUSES = new Set<string>([
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.READY_TO_SHIP,
]);

const DELIVERABLE_ORDER_STATUSES = new Set<string>([
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.READY_TO_SHIP,
  OrderStatus.SHIPPED,
]);

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

function buildTrackingEventDedupKey(event: {
  rawCode: string | null | undefined;
  description: string;
  occurredAt: Date;
}): string {
  if (event.rawCode && event.rawCode.trim().length > 0) {
    return `CODE:${event.rawCode.trim()}|${event.description.trim()}`;
  }
  return `TS:${event.occurredAt.toISOString()}|${event.description.trim()}`;
}

function resolveNextShipmentStatus(
  currentStatus: ShipmentStatus,
  snapshotStatus: TrackingSnapshot['status'],
): ShipmentStatus {
  if (currentStatus === ShipmentStatus.DELIVERED) {
    return ShipmentStatus.DELIVERED;
  }
  if (snapshotStatus === 'DELIVERED') {
    return ShipmentStatus.DELIVERED;
  }
  if (snapshotStatus === 'FAILED') {
    return ShipmentStatus.FAILED;
  }
  if (snapshotStatus === 'RETURNED') {
    return ShipmentStatus.RETURNED;
  }
  if (snapshotStatus === 'IN_TRANSIT') {
    return ShipmentStatus.IN_TRANSIT;
  }
  if (snapshotStatus === 'READY_TO_SHIP' && currentStatus === ShipmentStatus.UNFULFILLED) {
    return ShipmentStatus.READY_TO_SHIP;
  }
  return currentStatus;
}

@Injectable()
export class ShippingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OrdersService) private readonly ordersService: OrdersService,
    @Inject(ShippingMapper) private readonly shippingMapper: ShippingMapper,
    @Inject(SHIPPING_PROVIDER) private readonly shippingProvider: ShippingProvider,
    @Inject(IdempotencyService) private readonly idempotencyService: IdempotencyService,
    @Inject(OutboxWriterService) private readonly outboxWriter: OutboxWriterService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  async createShipment(params: {
    req: HttpRequestLike;
    res: IdempotencyResponseLike;
    actor: AuthenticatedActor;
    orderId: string;
    body: AdminCreateShipmentRequest;
  }): Promise<ShipmentDto> {
    const { req, res, actor, orderId, body } = params;

    const runCreate = async (tx: PrismaTransactionClient): Promise<ShipmentDto> => {
      const lockedOrder = await this.ordersService.lockOrderInTx(tx, orderId);
      if (!lockedOrder) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'ORDER_NOT_FOUND',
          'Order not found',
        );
      }

      if (!SHIPPABLE_ORDER_STATUSES.has(lockedOrder.status)) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'INVALID_STATE_TRANSITION',
          `Cannot create shipment for order in status ${lockedOrder.status}`,
          [{ field: 'status', issue: `Order status ${lockedOrder.status} is not eligible for dispatch` }],
        );
      }

      const warehouse = await tx.warehouse.findUnique({
        where: { code: body.warehouseCode },
      });
      if (!warehouse) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'WAREHOUSE_NOT_FOUND',
          `Warehouse "${body.warehouseCode}" was not found`,
        );
      }
      if (warehouse.status !== WarehouseStatus.ACTIVE) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'WAREHOUSE_INACTIVE',
          `Warehouse "${body.warehouseCode}" is not active`,
        );
      }

      const orderRecord = await tx.order.findUniqueOrThrow({
        where: { id: lockedOrder.id },
        include: {
          items: {
            orderBy: { createdAt: 'asc' },
            include: {
              variant: {
                select: {
                  weightGrams: true,
                },
              },
            },
          },
        },
      });

      const addr = readAddressSnapshot(orderRecord.addressSnapshot);
      const shippingItems = orderRecord.items.map((item) => ({
        sku: item.skuSnapshot,
        name: item.productNameSnapshot,
        quantity: item.quantity,
        weightGrams:
          item.variant?.weightGrams ?? SHIPPING_POLICY.DEFAULT_WEIGHT_GRAMS_FALLBACK,
      }));
      const totalWeightGrams = Math.max(
        1,
        shippingItems.reduce((sum, item) => sum + item.weightGrams * item.quantity, 0),
      );

      const dispatch = await this.shippingProvider.createShipment({
        orderNumber: orderRecord.orderNumber,
        originWarehouseCode: warehouse.code,
        destination: {
          recipientName: addr.recipientName,
          phone: addr.phone,
          addressLine1: addr.line1,
          ...(addr.line2 ? { addressLine2: addr.line2 } : {}),
          city: addr.city,
          province: addr.province,
          postalCode: addr.postalCode,
          countryCode: addr.countryCode,
        },
        serviceCode: body.serviceCode,
        totalWeightGrams,
        items: shippingItems,
      });

      const now = new Date();
      const createdShipment = await tx.shipment.create({
        data: {
          orderId: orderRecord.id,
          warehouseId: warehouse.id,
          provider: body.provider,
          serviceCode: body.serviceCode,
          providerReference: dispatch.providerReference,
          trackingNumber: dispatch.trackingNumber,
          labelUrl: dispatch.labelUrl ?? null,
          status: ShipmentStatus.IN_TRANSIT,
          shippedAt: now,
          events: {
            create: {
              status: ShipmentStatus.IN_TRANSIT,
              rawCode: 'DISPATCHED',
              description: `Shipment dispatched via ${body.provider} (${body.serviceCode})`,
              location: warehouse.city,
              occurredAt: now,
            },
          },
        },
        include: {
          warehouse: {
            select: { code: true },
          },
          events: {
            orderBy: { occurredAt: 'asc' },
          },
        },
      });

      await this.ordersService.transitionOrderStatusInTx(tx, {
        orderId: orderRecord.id,
        fromStatus: lockedOrder.status as OrderStatus,
        toStatus: OrderStatus.SHIPPED,
        reason: `Dispatched via ${body.provider} (${dispatch.trackingNumber})`,
        actorId: actor.userId,
        actorType: 'ADMIN',
      });

      await this.outboxWriter.enqueue(
        {
          aggregateType: 'shipment',
          aggregateId: createdShipment.id,
          eventType: 'shipment.dispatched',
          payload: {
            shipmentId: createdShipment.id,
            orderId: orderRecord.id,
            orderNumber: orderRecord.orderNumber,
            provider: body.provider,
            serviceCode: body.serviceCode,
            providerReference: dispatch.providerReference,
            trackingNumber: dispatch.trackingNumber,
            shippedAt: now.toISOString(),
          },
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'ADMIN',
          action: 'shipment.created',
          resource: 'shipment',
          resourceId: createdShipment.id,
          ipAddress: extractClientIp(req),
          beforeState: {
            orderId: orderRecord.id,
            orderStatus: lockedOrder.status,
          },
          afterState: {
            orderId: orderRecord.id,
            orderStatus: OrderStatus.SHIPPED,
            shipmentStatus: ShipmentStatus.IN_TRANSIT,
            provider: body.provider,
            serviceCode: body.serviceCode,
            trackingNumber: dispatch.trackingNumber,
          },
        },
        tx,
      );

      return this.shippingMapper.toShipmentDto(createdShipment);
    };

    const idempotencyKey = readOptionalIdempotencyKeyHeader(req);
    if (idempotencyKey) {
      return this.idempotencyService.execute<ShipmentDto>({
        idempotencyKey,
        actorScope: `admin:${actor.userId}`,
        route: `POST:/api/v1/admin/orders/${orderId}/shipments`,
        requestPayload: {
          orderId,
          provider: body.provider,
          serviceCode: body.serviceCode,
          warehouseCode: body.warehouseCode,
        },
        res,
        successStatus: HttpStatus.CREATED,
        run: runCreate,
      });
    }

    return this.prisma.withTransaction(runCreate);
  }

  async syncTracking(params: {
    req: HttpRequestLike;
    actor: AuthenticatedActor;
    shipmentId: string;
  }): Promise<ShipmentDto> {
    const { req, actor, shipmentId } = params;

    return this.prisma.withTransaction(async (tx) => {
      const lockedShipments = await tx.$queryRaw<
        Array<{
          id: string;
          orderId: string;
          trackingNumber: string | null;
          status: string;
          deliveredAt: Date | null;
        }>
      >`
        SELECT
          "id"::text AS "id",
          "order_id"::text AS "orderId",
          "tracking_number" AS "trackingNumber",
          "status"::text AS "status",
          "delivered_at" AS "deliveredAt"
        FROM "shipments"
        WHERE "id" = ${shipmentId}::uuid
        FOR UPDATE
      `;

      const lockedShipment = lockedShipments[0];
      if (!lockedShipment) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'SHIPMENT_NOT_FOUND',
          'Shipment not found',
        );
      }

      if (!lockedShipment.trackingNumber) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'TRACKING_NUMBER_MISSING',
          'Shipment does not have a tracking number yet',
        );
      }

      const lockedOrder = await this.ordersService.lockOrderInTx(
        tx,
        lockedShipment.orderId,
      );
      if (!lockedOrder) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'ORDER_NOT_FOUND',
          'Parent order not found',
        );
      }

      const snapshot = await this.shippingProvider.getTracking(
        lockedShipment.trackingNumber,
      );

      const existingEvents = await tx.shipmentEvent.findMany({
        where: { shipmentId: lockedShipment.id },
        select: {
          rawCode: true,
          description: true,
          occurredAt: true,
        },
      });

      const seenKeys = new Set(existingEvents.map(buildTrackingEventDedupKey));
      const nextStatus = resolveNextShipmentStatus(
        lockedShipment.status as ShipmentStatus,
        snapshot.status,
      );
      const snapshotMappedStatus = snapshot.status as ShipmentStatus;
      const now = new Date();

      let appendedEventsCount = 0;
      for (const evt of snapshot.events) {
        const key = buildTrackingEventDedupKey({
          rawCode: evt.rawCode ?? null,
          description: evt.description,
          occurredAt: evt.occurredAt,
        });
        if (seenKeys.has(key)) {
          continue;
        }
        seenKeys.add(key);
        await tx.shipmentEvent.create({
          data: {
            shipmentId: lockedShipment.id,
            status: snapshotMappedStatus,
            rawCode: evt.rawCode ?? null,
            description: evt.description,
            location: evt.location ?? null,
            occurredAt: evt.occurredAt,
          },
        });
        appendedEventsCount += 1;
      }

      const deliveredAt =
        nextStatus === ShipmentStatus.DELIVERED
          ? (lockedShipment.deliveredAt ?? now)
          : lockedShipment.deliveredAt;

      await tx.shipment.update({
        where: { id: lockedShipment.id },
        data: {
          status: nextStatus,
          deliveredAt,
        },
      });

      let nextOrderStatus = lockedOrder.status;
      if (
        nextStatus === ShipmentStatus.DELIVERED &&
        DELIVERABLE_ORDER_STATUSES.has(lockedOrder.status)
      ) {
        await this.ordersService.transitionOrderStatusInTx(tx, {
          orderId: lockedOrder.id,
          fromStatus: lockedOrder.status as OrderStatus,
          toStatus: OrderStatus.DELIVERED,
          reason: `Delivered via tracking sync (${lockedShipment.trackingNumber})`,
          actorId: actor.userId,
          actorType: 'ADMIN',
        });
        nextOrderStatus = OrderStatus.DELIVERED;

        await this.outboxWriter.enqueue(
          {
            aggregateType: 'shipment',
            aggregateId: lockedShipment.id,
            eventType: 'shipment.delivered',
            payload: {
              shipmentId: lockedShipment.id,
              orderId: lockedOrder.id,
              orderNumber: lockedOrder.orderNumber,
              trackingNumber: lockedShipment.trackingNumber,
              deliveredAt: deliveredAt!.toISOString(),
            },
          },
          tx,
        );
      }

      await this.auditLog.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'ADMIN',
          action: 'shipment.tracking_synced',
          resource: 'shipment',
          resourceId: lockedShipment.id,
          ipAddress: extractClientIp(req),
          beforeState: {
            status: lockedShipment.status,
            orderStatus: lockedOrder.status,
          },
          afterState: {
            status: nextStatus,
            orderStatus: nextOrderStatus,
            appendedEventsCount,
            trackingNumber: lockedShipment.trackingNumber,
          },
        },
        tx,
      );

      const refreshed = await tx.shipment.findUniqueOrThrow({
        where: { id: lockedShipment.id },
        include: {
          warehouse: {
            select: { code: true },
          },
          events: {
            orderBy: { occurredAt: 'asc' },
          },
        },
      });

      return this.shippingMapper.toShipmentDto(refreshed);
    });
  }
}
