import { Inject, Injectable } from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  type PrismaTransactionClient,
} from '@arven/database';
import { PrismaService } from '../../../../shared/prisma/prisma.service.js';
import type { PaymentRecord } from '../../../orders/index.js';
import type {
  LockedOrderForPaymentSession,
  LockedPaymentAndOrderRow,
} from '../../domain/ports/payments.ports.js';

interface LockedOrderSqlRow {
  id: string;
  orderNumber: string;
  userId: string | null;
  guestEmail: string | null;
  guestTokenHash: string | null;
  status: string;
  grandTotalIdr: bigint;
  paymentExpiresAt: Date;
  addressSnapshot: Prisma.JsonValue;
}

interface LockedPaymentOrderSqlRow {
  paymentId: string;
  paymentStatus: string;
  paymentAmountIdr: bigint;
  paymentMethod: string | null;
  paymentProviderTransactionId: string | null;
  orderId: string;
  orderNumber: string;
  orderUserId: string | null;
  orderStatus: string;
  orderGrandTotalIdr: bigint;
}

export type PaymentWithOrderAccess = Prisma.PaymentGetPayload<{
  include: {
    order: {
      select: {
        id: true;
        userId: true;
        guestTokenHash: true;
      };
    };
  };
}>;

@Injectable()
export class PrismaPaymentsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findPaymentWithOrderAccess(
    paymentId: string,
  ): Promise<PaymentWithOrderAccess | null> {
    return this.prisma.client.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          select: {
            id: true,
            userId: true,
            guestTokenHash: true,
          },
        },
      },
    });
  }

  async lockOrderForPaymentSession(
    tx: PrismaTransactionClient,
    orderId: string,
  ): Promise<LockedOrderForPaymentSession | null> {
    const rows = await tx.$queryRaw<Array<LockedOrderSqlRow>>`
      SELECT
        "id"::text AS "id",
        "order_number" AS "orderNumber",
        "user_id"::text AS "userId",
        "guest_email" AS "guestEmail",
        "guest_token_hash" AS "guestTokenHash",
        "status"::text AS "status",
        "grand_total_idr" AS "grandTotalIdr",
        "payment_expires_at" AS "paymentExpiresAt",
        "address_snapshot" AS "addressSnapshot"
      FROM "orders"
      WHERE "id" = ${orderId}::uuid
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) {
      return null;
    }

    const addrObj =
      typeof row.addressSnapshot === 'object' &&
      row.addressSnapshot !== null &&
      !Array.isArray(row.addressSnapshot)
        ? (row.addressSnapshot as Record<string, unknown>)
        : {};

    return {
      id: row.id,
      orderNumber: row.orderNumber,
      userId: row.userId,
      guestEmail: row.guestEmail,
      guestTokenHash: row.guestTokenHash,
      status: row.status,
      grandTotalIdr: Number(row.grandTotalIdr),
      paymentExpiresAt: row.paymentExpiresAt,
      addressRecipientName:
        typeof addrObj['recipientName'] === 'string'
          ? addrObj['recipientName']
          : 'ARVEN Client',
      addressPhone:
        typeof addrObj['phone'] === 'string' ? addrObj['phone'] : '+628110000000',
    };
  }

  async findOrderItemsAndCustomer(
    tx: PrismaTransactionClient,
    orderId: string,
    userId: string | null,
  ): Promise<{
    items: Array<{ sku: string; name: string; unitPriceIdr: number; quantity: number }>;
    customerUser: { fullName: string; email: string; phone: string | null } | null;
  }> {
    const [items, user] = await Promise.all([
      tx.orderItem.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
        select: {
          skuSnapshot: true,
          productNameSnapshot: true,
          unitPriceIdr: true,
          quantity: true,
        },
      }),
      userId
        ? tx.user.findUnique({
            where: { id: userId },
            select: {
              fullName: true,
              email: true,
              phone: true,
            },
          })
        : Promise.resolve(null),
    ]);

    return {
      items: items.map((item) => ({
        sku: item.skuSnapshot,
        name: item.productNameSnapshot,
        unitPriceIdr: Number(item.unitPriceIdr),
        quantity: item.quantity,
      })),
      customerUser: user,
    };
  }

  async findLatestPendingPayment(
    tx: PrismaTransactionClient,
    orderId: string,
  ): Promise<PaymentRecord | null> {
    return tx.payment.findFirst({
      where: {
        orderId,
        status: PaymentStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPaymentRecord(
    tx: PrismaTransactionClient,
    data: {
      orderId: string;
      provider: string;
      providerReference: string;
      method: string | null;
      amountIdr: number;
      snapToken: string | null;
      redirectUrl: string | null;
      expiresAt: Date;
    },
  ): Promise<PaymentRecord> {
    return tx.payment.create({
      data: {
        orderId: data.orderId,
        provider: data.provider,
        providerReference: data.providerReference,
        method: data.method,
        status: PaymentStatus.PENDING,
        amountIdr: BigInt(data.amountIdr),
        currency: 'IDR',
        snapToken: data.snapToken,
        redirectUrl: data.redirectUrl,
        expiresAt: data.expiresAt,
      },
    });
  }

  async insertWebhookEventDedup(params: {
    provider: string;
    providerEventId: string;
    eventType: string;
    signatureValid: boolean;
    payload: Record<string, unknown>;
  }): Promise<{ duplicate: boolean; eventId: string | null }> {
    try {
      const created = await this.prisma.client.paymentEvent.create({
        data: {
          provider: params.provider,
          providerEventId: params.providerEventId,
          eventType: params.eventType,
          signatureValid: params.signatureValid,
          payload: params.payload as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      return { duplicate: false, eventId: created.id };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { duplicate: true, eventId: null };
      }
      throw error;
    }
  }

  async deleteUnprocessedWebhookEvent(eventId: string): Promise<void> {
    await this.prisma.client.paymentEvent.deleteMany({
      where: {
        id: eventId,
        processedAt: null,
      },
    });
  }

  async lockPaymentAndOrderByReference(
    tx: PrismaTransactionClient,
    providerReference: string,
  ): Promise<LockedPaymentAndOrderRow | null> {
    const rows = await tx.$queryRaw<Array<LockedPaymentOrderSqlRow>>`
      SELECT
        p."id"::text AS "paymentId",
        p."status"::text AS "paymentStatus",
        p."amount_idr" AS "paymentAmountIdr",
        p."method" AS "paymentMethod",
        p."provider_transaction_id" AS "paymentProviderTransactionId",
        o."id"::text AS "orderId",
        o."order_number" AS "orderNumber",
        o."user_id"::text AS "orderUserId",
        o."status"::text AS "orderStatus",
        o."grand_total_idr" AS "orderGrandTotalIdr"
      FROM "payments" p
      INNER JOIN "orders" o ON o."id" = p."order_id"
      WHERE p."provider_reference" = ${providerReference}
      FOR UPDATE OF p, o
    `;

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      paymentId: row.paymentId,
      paymentStatus: row.paymentStatus,
      paymentAmountIdr: Number(row.paymentAmountIdr),
      paymentMethod: row.paymentMethod,
      paymentProviderTransactionId: row.paymentProviderTransactionId,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      orderUserId: row.orderUserId,
      orderStatus: row.orderStatus,
      orderGrandTotalIdr: Number(row.orderGrandTotalIdr),
    };
  }

  async markWebhookEventProcessed(
    tx: PrismaTransactionClient,
    params: {
      eventId: string;
      paymentId: string | null;
      processingError?: string | null;
    },
  ): Promise<void> {
    await tx.paymentEvent.update({
      where: { id: params.eventId },
      data: {
        paymentId: params.paymentId,
        processedAt: new Date(),
        processingError: params.processingError ?? null,
      },
    });
  }

  async updatePaymentAndOrderOnSettlement(
    tx: PrismaTransactionClient,
    params: {
      paymentId: string;
      orderId: string;
      fromOrderStatus: OrderStatus;
      settledAt: Date;
      method: string | null;
      providerTransactionId: string | null;
    },
  ): Promise<void> {
    await tx.payment.update({
      where: { id: params.paymentId },
      data: {
        status: PaymentStatus.SETTLEMENT,
        settledAt: params.settledAt,
        method: params.method,
        providerTransactionId: params.providerTransactionId,
        failureReason: null,
      },
    });

    await tx.order.update({
      where: { id: params.orderId },
      data: {
        status: OrderStatus.PAID,
        paidAt: params.settledAt,
      },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: params.orderId,
        fromStatus: params.fromOrderStatus,
        toStatus: OrderStatus.PAID,
        reason: 'Payment settled via midtrans webhook',
        actorId: null,
        actorType: 'WEBHOOK',
      },
    });
  }

  async updatePaymentOnAuthorized(
    tx: PrismaTransactionClient,
    params: {
      paymentId: string;
      method: string | null;
      providerTransactionId: string | null;
    },
  ): Promise<void> {
    await tx.payment.update({
      where: { id: params.paymentId },
      data: {
        status: PaymentStatus.AUTHORIZED,
        method: params.method,
        providerTransactionId: params.providerTransactionId,
      },
    });
  }

  async updatePaymentAndOrderOnFailureOrExpiry(
    tx: PrismaTransactionClient,
    params: {
      paymentId: string;
      orderId: string;
      fromOrderStatus: OrderStatus;
      targetPaymentStatus: 'FAILED' | 'EXPIRED';
      targetOrderStatus: 'CANCELLED' | 'EXPIRED';
      method: string | null;
      providerTransactionId: string | null;
      reason: string;
    },
  ): Promise<void> {
    await tx.payment.update({
      where: { id: params.paymentId },
      data: {
        status:
          params.targetPaymentStatus === 'EXPIRED'
            ? PaymentStatus.EXPIRED
            : PaymentStatus.FAILED,
        method: params.method,
        providerTransactionId: params.providerTransactionId,
        failureReason: params.reason,
      },
    });

    await tx.order.update({
      where: { id: params.orderId },
      data: {
        status:
          params.targetOrderStatus === 'EXPIRED'
            ? OrderStatus.EXPIRED
            : OrderStatus.CANCELLED,
      },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: params.orderId,
        fromStatus: params.fromOrderStatus,
        toStatus:
          params.targetOrderStatus === 'EXPIRED'
            ? OrderStatus.EXPIRED
            : OrderStatus.CANCELLED,
        reason: params.reason,
        actorId: null,
        actorType: 'WEBHOOK',
      },
    });
  }

  async flagLateSettlementConflict(
    tx: PrismaTransactionClient,
    params: {
      paymentId: string;
      method: string | null;
      providerTransactionId: string | null;
      reason: string;
    },
  ): Promise<void> {
    await tx.payment.update({
      where: { id: params.paymentId },
      data: {
        method: params.method,
        providerTransactionId: params.providerTransactionId,
        failureReason: params.reason,
      },
    });
  }
}
