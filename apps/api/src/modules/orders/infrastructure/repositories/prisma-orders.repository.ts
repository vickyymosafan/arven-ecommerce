import { Inject, Injectable } from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  type Prisma,
  type PrismaTransactionClient,
} from '@arven/database';
import { PrismaService } from '../../../../shared/prisma/prisma.service.js';
import type { OrderSummaryRecord, OrderWithRelations } from '../mappers/orders.mapper.js';

export interface LockedOrderRow {
  id: string;
  orderNumber: string;
  userId: string | null;
  guestTokenHash: string | null;
  status: string;
}

const ORDER_DETAIL_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  payments: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.OrderInclude;

@Injectable()
export class PrismaOrdersRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findManyByUserId(params: {
    userId: string;
    status?: OrderStatus;
    page: number;
    limit: number;
  }): Promise<{ orders: OrderSummaryRecord[]; total: number }> {
    const where: Prisma.OrderWhereInput = {
      userId: params.userId,
      ...(params.status ? { status: params.status } : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [orders, total] = await Promise.all([
      this.prisma.client.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
        include: {
          items: {
            select: {
              quantity: true,
            },
          },
        },
      }),
      this.prisma.client.order.count({ where }),
    ]);

    return { orders, total };
  }

  async findDetailByOrderNumber(orderNumber: string): Promise<OrderWithRelations | null> {
    return this.prisma.client.order.findUnique({
      where: { orderNumber },
      include: ORDER_DETAIL_INCLUDE,
    });
  }

  async findDetailById(
    orderId: string,
    tx?: PrismaTransactionClient,
  ): Promise<OrderWithRelations | null> {
    const db = tx ?? this.prisma.client;
    return db.order.findUnique({
      where: { id: orderId },
      include: ORDER_DETAIL_INCLUDE,
    });
  }

  async lockOrderForUpdate(
    tx: PrismaTransactionClient,
    orderId: string,
  ): Promise<LockedOrderRow | null> {
    const rows = await tx.$queryRaw<Array<LockedOrderRow>>`
      SELECT
        "id"::text AS "id",
        "order_number" AS "orderNumber",
        "user_id"::text AS "userId",
        "guest_token_hash" AS "guestTokenHash",
        "status"::text AS "status"
      FROM "orders"
      WHERE "id" = ${orderId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  async markOrderCancelled(
    tx: PrismaTransactionClient,
    params: {
      orderId: string;
      fromStatus: OrderStatus;
      reason: string;
      actorId: string | null;
      actorType: 'CUSTOMER' | 'GUEST';
    },
  ): Promise<void> {
    await tx.order.update({
      where: { id: params.orderId },
      data: {
        status: OrderStatus.CANCELLED,
      },
    });

    await tx.payment.updateMany({
      where: {
        orderId: params.orderId,
        status: PaymentStatus.PENDING,
      },
      data: {
        status: PaymentStatus.EXPIRED,
        failureReason: params.reason,
      },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: params.orderId,
        fromStatus: params.fromStatus,
        toStatus: OrderStatus.CANCELLED,
        reason: params.reason,
        actorId: params.actorId,
        actorType: params.actorType,
      },
    });
  }
}
