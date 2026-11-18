import { Inject, Injectable } from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  type Prisma,
  type PrismaTransactionClient,
} from '@arven/database';
import { PrismaService } from '../../../../shared/prisma/prisma.service.js';
import type {
  AdminOrderDetailRecord,
  AdminOrderSummaryRecord,
  OrderSummaryRecord,
  OrderWithRelations,
} from '../mappers/orders.mapper.js';

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

const ADMIN_ORDER_DETAIL_INCLUDE = {
  user: {
    select: {
      email: true,
    },
  },
  items: { orderBy: { createdAt: 'asc' as const } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  payments: { orderBy: { createdAt: 'desc' as const } },
  shipments: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      warehouse: {
        select: {
          code: true,
        },
      },
      events: {
        orderBy: { occurredAt: 'asc' as const },
      },
    },
  },
  returns: {
    orderBy: { createdAt: 'desc' as const },
    include: {
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
    },
  },
  refunds: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      requester: {
        select: {
          email: true,
        },
      },
      approver: {
        select: {
          email: true,
        },
      },
    },
  },
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

  async findManyAdmin(params: {
    status?: OrderStatus;
    q?: string;
    page: number;
    limit: number;
  }): Promise<{ orders: AdminOrderSummaryRecord[]; total: number }> {
    const search = params.q?.trim();
    const where: Prisma.OrderWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(search && search.length > 0
        ? {
            OR: [
              { orderNumber: { contains: search, mode: 'insensitive' } },
              { guestEmail: { contains: search, mode: 'insensitive' } },
              { user: { email: { contains: search, mode: 'insensitive' } } },
              { user: { fullName: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [orders, total] = await Promise.all([
      this.prisma.client.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: params.limit,
        include: {
          user: {
            select: {
              email: true,
            },
          },
          items: {
            select: {
              quantity: true,
            },
          },
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              status: true,
            },
          },
          shipments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              status: true,
              trackingNumber: true,
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

  async findAdminDetailById(
    orderId: string,
    tx?: PrismaTransactionClient,
  ): Promise<AdminOrderDetailRecord | null> {
    const db = tx ?? this.prisma.client;
    return db.order.findUnique({
      where: { id: orderId },
      include: ADMIN_ORDER_DETAIL_INCLUDE,
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
    await tx.order.update({
      where: { id: params.orderId },
      data: {
        status: params.toStatus,
      },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: params.orderId,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        reason: params.reason,
        actorId: params.actorId,
        actorType: params.actorType,
      },
    });
  }

  async markOrderCancelled(
    tx: PrismaTransactionClient,
    params: {
      orderId: string;
      fromStatus: OrderStatus;
      reason: string;
      actorId: string | null;
      actorType: 'CUSTOMER' | 'GUEST' | 'ADMIN';
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
