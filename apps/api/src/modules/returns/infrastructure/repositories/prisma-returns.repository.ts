import { Inject, Injectable } from '@nestjs/common';
import {
  OrderStatus,
  ReturnItemCondition,
  ReturnStatus,
  type Prisma,
  type PrismaTransactionClient,
} from '@arven/database';
import { PrismaService } from '../../../../shared/prisma/prisma.service.js';
import type {
  LockedOrderForReturn,
  LockedReturnRow,
} from '../../domain/ports/returns.ports.js';
import type { ReturnWithRelations } from '../mappers/returns.mapper.js';

const RETURN_DETAIL_INCLUDE = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      userId: true,
      guestEmail: true,
      guestTokenHash: true,
    },
  },
  user: {
    select: {
      email: true,
    },
  },
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      orderItem: true,
    },
  },
} satisfies Prisma.ReturnInclude;

@Injectable()
export class PrismaReturnsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async lockOrderForReturn(
    tx: PrismaTransactionClient,
    orderId: string,
  ): Promise<LockedOrderForReturn | null> {
    const rows = await tx.$queryRaw<Array<LockedOrderForReturn>>`
      SELECT
        "id"::text AS "id",
        "order_number" AS "orderNumber",
        "user_id"::text AS "userId",
        "guest_token_hash" AS "guestTokenHash",
        "status"::text AS "status",
        "updated_at" AS "updatedAt"
      FROM "orders"
      WHERE "id" = ${orderId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  async lockReturnForUpdate(
    tx: PrismaTransactionClient,
    returnId: string,
  ): Promise<LockedReturnRow | null> {
    const rows = await tx.$queryRaw<Array<LockedReturnRow>>`
      SELECT
        "id"::text AS "id",
        "order_id"::text AS "orderId",
        "user_id"::text AS "userId",
        "status"::text AS "status",
        "admin_notes" AS "adminNotes"
      FROM "returns"
      WHERE "id" = ${returnId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  async findOrderDeliveryTimestamp(
    tx: PrismaTransactionClient,
    orderId: string,
    fallbackUpdatedAt: Date,
  ): Promise<Date> {
    const [deliveredShipment, deliveredHistory] = await Promise.all([
      tx.shipment.findFirst({
        where: {
          orderId,
          deliveredAt: { not: null },
        },
        orderBy: { deliveredAt: 'desc' },
        select: { deliveredAt: true },
      }),
      tx.orderStatusHistory.findFirst({
        where: {
          orderId,
          toStatus: OrderStatus.DELIVERED,
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return (
      deliveredShipment?.deliveredAt ??
      deliveredHistory?.createdAt ??
      fallbackUpdatedAt
    );
  }

  async findOrderItemsAndReturnedQuantities(
    tx: PrismaTransactionClient,
    orderId: string,
  ): Promise<{
    orderItems: Array<{
      id: string;
      variantId: string | null;
      sku: string;
      quantity: number;
    }>;
    alreadyReturnedByOrderItemId: Map<string, number>;
  }> {
    const [orderItems, returnedRows] = await Promise.all([
      tx.orderItem.findMany({
        where: { orderId },
        select: {
          id: true,
          variantId: true,
          skuSnapshot: true,
          quantity: true,
        },
      }),
      tx.returnItem.findMany({
        where: {
          returnRecord: {
            orderId,
            status: { not: ReturnStatus.REJECTED },
          },
        },
        select: {
          orderItemId: true,
          quantity: true,
        },
      }),
    ]);

    const alreadyReturnedByOrderItemId = new Map<string, number>();
    for (const row of returnedRows) {
      alreadyReturnedByOrderItemId.set(
        row.orderItemId,
        (alreadyReturnedByOrderItemId.get(row.orderItemId) ?? 0) + row.quantity,
      );
    }

    return {
      orderItems: orderItems.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        sku: item.skuSnapshot,
        quantity: item.quantity,
      })),
      alreadyReturnedByOrderItemId,
    };
  }

  async createReturnWithItems(
    tx: PrismaTransactionClient,
    params: {
      orderId: string;
      userId: string | null;
      reason: string;
      customerNotes: string | null;
      items: ReadonlyArray<{ orderItemId: string; quantity: number }>;
    },
  ): Promise<ReturnWithRelations> {
    const created = await tx.return.create({
      data: {
        orderId: params.orderId,
        userId: params.userId,
        status: ReturnStatus.REQUESTED,
        reason: params.reason,
        customerNotes: params.customerNotes,
        evidenceKeys: [],
        items: {
          create: params.items.map((item) => ({
            orderItemId: item.orderItemId,
            quantity: item.quantity,
          })),
        },
      },
      include: RETURN_DETAIL_INCLUDE,
    });

    return created;
  }

  async findDetailById(
    returnId: string,
    tx?: PrismaTransactionClient,
  ): Promise<ReturnWithRelations | null> {
    const db = tx ?? this.prisma.client;
    return db.return.findUnique({
      where: { id: returnId },
      include: RETURN_DETAIL_INCLUDE,
    });
  }

  async findManyByUserId(params: {
    userId: string;
    page: number;
    limit: number;
  }): Promise<{ rows: ReturnWithRelations[]; total: number }> {
    const where: Prisma.ReturnWhereInput = { userId: params.userId };
    const skip = (params.page - 1) * params.limit;

    const [rows, total] = await Promise.all([
      this.prisma.client.return.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: params.limit,
        include: RETURN_DETAIL_INCLUDE,
      }),
      this.prisma.client.return.count({ where }),
    ]);

    return { rows, total };
  }

  async findManyAdmin(params: {
    status?: ReturnStatus;
    page: number;
    limit: number;
  }): Promise<{ rows: ReturnWithRelations[]; total: number }> {
    const where: Prisma.ReturnWhereInput = {
      ...(params.status ? { status: params.status } : {}),
    };
    const skip = (params.page - 1) * params.limit;

    const [rows, total] = await Promise.all([
      this.prisma.client.return.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: params.limit,
        include: RETURN_DETAIL_INCLUDE,
      }),
      this.prisma.client.return.count({ where }),
    ]);

    return { rows, total };
  }

  async countOtherOpenReturnsForOrder(
    tx: PrismaTransactionClient,
    orderId: string,
    excludeReturnId: string,
  ): Promise<number> {
    return tx.return.count({
      where: {
        orderId,
        id: { not: excludeReturnId },
        status: { not: ReturnStatus.REJECTED },
      },
    });
  }

  async updateReturnItemInspectionCondition(
    tx: PrismaTransactionClient,
    returnItemId: string,
    condition: ReturnItemCondition,
  ): Promise<void> {
    await tx.returnItem.update({
      where: { id: returnItemId },
      data: { condition },
    });
  }

  async markReturnItemRestockedIfUnrestocked(
    tx: PrismaTransactionClient,
    returnItemId: string,
  ): Promise<boolean> {
    const updated = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "return_items"
      SET "restocked" = true
      WHERE "id" = ${returnItemId}::uuid
        AND "restocked" = false
      RETURNING "id"::text AS "id"
    `;
    return updated.length === 1;
  }
}
