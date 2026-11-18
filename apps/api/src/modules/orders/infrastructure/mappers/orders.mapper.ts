import { Injectable } from '@nestjs/common';
import type {
  OrderAddressSnapshotDto,
  OrderDetailDto,
  OrderItemDto,
  OrderStatusHistoryDto,
  OrderSummaryDto,
  PaymentSummaryDto,
} from '@arven/contracts';
import type { Prisma } from '@arven/database';
import type { OrderStatusInput, PaymentStatusInput } from '@arven/validators';

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    items: { orderBy: { createdAt: 'asc' } };
    statusHistory: { orderBy: { createdAt: 'asc' } };
    payments: { orderBy: { createdAt: 'desc' } };
  };
}>;

export type OrderSummaryRecord = Prisma.OrderGetPayload<{
  include: {
    items: {
      select: {
        quantity: true;
      };
    };
  };
}>;

export type PaymentRecord = Prisma.PaymentGetPayload<Record<string, never>>;

function readAddressSnapshot(raw: Prisma.JsonValue): OrderAddressSnapshotDto {
  const obj =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const asString = (key: string, fallback = ''): string =>
    typeof obj[key] === 'string' ? (obj[key] as string) : fallback;
  const asNullableString = (key: string): string | null =>
    typeof obj[key] === 'string' && (obj[key] as string).length > 0
      ? (obj[key] as string)
      : null;

  return {
    recipientName: asString('recipientName'),
    phone: asString('phone'),
    line1: asString('line1'),
    line2: asNullableString('line2'),
    subdistrict: asNullableString('subdistrict'),
    city: asString('city'),
    province: asString('province'),
    postalCode: asString('postalCode'),
    countryCode: asString('countryCode', 'ID'),
  };
}

function readConfigurationSnapshot(raw: Prisma.JsonValue): Record<string, unknown> {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

@Injectable()
export class OrdersMapper {
  toPaymentSummaryDto(payment: PaymentRecord): PaymentSummaryDto {
    return {
      id: payment.id,
      orderId: payment.orderId,
      provider: payment.provider,
      providerReference: payment.providerReference,
      providerTransactionId: payment.providerTransactionId,
      method: payment.method,
      status: payment.status as PaymentStatusInput,
      amountIdr: Number(payment.amountIdr),
      currency: 'IDR',
      snapToken: payment.snapToken,
      redirectUrl: payment.redirectUrl,
      expiresAt: payment.expiresAt.toISOString(),
      settledAt: payment.settledAt ? payment.settledAt.toISOString() : null,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    };
  }

  toOrderSummaryDto(order: OrderSummaryRecord): OrderSummaryDto {
    const itemCount = order.items.length;
    const totalQuantity = order.items.reduce((acc, item) => acc + item.quantity, 0);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status as OrderStatusInput,
      currency: 'IDR',
      itemCount,
      totalQuantity,
      subtotalIdr: Number(order.subtotalIdr),
      discountTotalIdr: Number(order.discountTotalIdr),
      shippingTotalIdr: Number(order.shippingTotalIdr),
      taxTotalIdr: Number(order.taxTotalIdr),
      grandTotalIdr: Number(order.grandTotalIdr),
      shippingProvider: order.shippingProvider,
      shippingService: order.shippingService,
      paymentExpiresAt: order.paymentExpiresAt.toISOString(),
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  toOrderDetailDto(order: OrderWithRelations): OrderDetailDto {
    const items: OrderItemDto[] = order.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      sku: item.skuSnapshot,
      productName: item.productNameSnapshot,
      size: item.sizeSnapshot,
      color: item.colorSnapshot,
      unitPriceIdr: Number(item.unitPriceIdr),
      discountAllocatedIdr: Number(item.discountAllocatedIdr),
      quantity: item.quantity,
      lineTotalIdr: Number(item.lineTotalIdr),
      configuration: readConfigurationSnapshot(item.configurationSnapshot),
    }));

    const statusHistory: OrderStatusHistoryDto[] = order.statusHistory.map((entry) => ({
      id: entry.id,
      fromStatus: (entry.fromStatus as OrderStatusInput | null) ?? null,
      toStatus: entry.toStatus as OrderStatusInput,
      reason: entry.reason,
      actorType: entry.actorType,
      createdAt: entry.createdAt.toISOString(),
    }));

    const payments = order.payments.map((payment) => this.toPaymentSummaryDto(payment));
    const latestPayment = payments[0] ?? null;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      isGuest: order.userId === null,
      guestEmail: order.guestEmail,
      status: order.status as OrderStatusInput,
      currency: 'IDR',
      subtotalIdr: Number(order.subtotalIdr),
      discountTotalIdr: Number(order.discountTotalIdr),
      shippingTotalIdr: Number(order.shippingTotalIdr),
      taxTotalIdr: Number(order.taxTotalIdr),
      grandTotalIdr: Number(order.grandTotalIdr),
      shippingProvider: order.shippingProvider,
      shippingService: order.shippingService,
      couponCodeSnapshot: order.couponCodeSnapshot,
      addressSnapshot: readAddressSnapshot(order.addressSnapshot),
      items,
      statusHistory,
      latestPayment,
      payments,
      paymentExpiresAt: order.paymentExpiresAt.toISOString(),
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }
}
