import { Injectable } from '@nestjs/common';
import type {
  AdminOrderDetailDto,
  AdminOrderSummaryDto,
  OrderAddressSnapshotDto,
  OrderDetailDto,
  OrderItemDto,
  OrderStatusHistoryDto,
  OrderSummaryDto,
  PaymentSummaryDto,
  RefundDto,
  ReturnDetailDto,
  ReturnItemDto,
  ShipmentDto,
  ShipmentEventDto,
} from '@arven/contracts';
import type { Prisma } from '@arven/database';
import { maskEmail, maskPhone } from '@arven/observability';
import type {
  OrderStatusInput,
  PaymentStatusInput,
  RefundStatusInput,
  ReturnItemConditionInput,
  ReturnStatusInput,
  ShipmentStatusInput,
} from '@arven/validators';

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: {
    items: { orderBy: { createdAt: 'asc' } };
    statusHistory: { orderBy: { createdAt: 'asc' } };
    payments: { orderBy: { createdAt: 'desc' } };
  };
}>;

export type AdminOrderSummaryRecord = Prisma.OrderGetPayload<{
  include: {
    user: {
      select: {
        email: true;
      };
    };
    items: {
      select: {
        quantity: true;
      };
    };
    payments: {
      orderBy: { createdAt: 'desc' };
      take: 1;
      select: {
        status: true;
      };
    };
    shipments: {
      orderBy: { createdAt: 'desc' };
      take: 1;
      select: {
        status: true;
        trackingNumber: true;
      };
    };
  };
}>;

export type AdminOrderDetailRecord = Prisma.OrderGetPayload<{
  include: {
    user: {
      select: {
        email: true;
      };
    };
    items: { orderBy: { createdAt: 'asc' } };
    statusHistory: { orderBy: { createdAt: 'asc' } };
    payments: { orderBy: { createdAt: 'desc' } };
    shipments: {
      orderBy: { createdAt: 'desc' };
      include: {
        warehouse: {
          select: {
            code: true;
          };
        };
        events: {
          orderBy: { occurredAt: 'asc' };
        };
      };
    };
    returns: {
      orderBy: { createdAt: 'desc' };
      include: {
        user: {
          select: {
            email: true;
          };
        };
        items: {
          orderBy: { createdAt: 'asc' };
          include: {
            orderItem: true;
          };
        };
      };
    };
    refunds: {
      orderBy: { createdAt: 'desc' };
      include: {
        requester: {
          select: {
            email: true;
          };
        };
        approver: {
          select: {
            email: true;
          };
        };
      };
    };
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

export function maskPersonName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '***';
  }
  return trimmed
    .split(/\s+/)
    .map((part) => (part.length <= 1 ? '*' : `${part[0]}***`))
    .join(' ');
}

export function maskAddressLine(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '***';
  }
  if (trimmed.length <= 2) {
    return '***';
  }
  return `${trimmed.slice(0, 2)}***`;
}

export function readAddressSnapshot(raw: Prisma.JsonValue): OrderAddressSnapshotDto {
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

export function maskOrderAddressSnapshot(
  snapshot: OrderAddressSnapshotDto,
): OrderAddressSnapshotDto {
  return {
    recipientName: maskPersonName(snapshot.recipientName),
    phone: maskPhone(snapshot.phone),
    line1: maskAddressLine(snapshot.line1),
    line2: snapshot.line2 ? '***' : null,
    subdistrict: snapshot.subdistrict ? '***' : null,
    city: snapshot.city,
    province: snapshot.province,
    postalCode: snapshot.postalCode,
    countryCode: snapshot.countryCode,
  };
}

function readConfigurationSnapshot(raw: Prisma.JsonValue): Record<string, unknown> {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function readJsonRecord(raw: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function readStringArray(raw: Prisma.JsonValue): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((entry): entry is string => typeof entry === 'string');
}

@Injectable()
export class OrdersMapper {
  toPaymentSummaryDto(
    payment: PaymentRecord,
    options: { redactGateway?: boolean } = {},
  ): PaymentSummaryDto {
    const redactGateway = Boolean(options.redactGateway);
    return {
      id: payment.id,
      orderId: payment.orderId,
      provider: payment.provider,
      providerReference: redactGateway ? 'gateway-redacted' : payment.providerReference,
      providerTransactionId: redactGateway ? null : payment.providerTransactionId,
      method: payment.method,
      status: payment.status as PaymentStatusInput,
      amountIdr: Number(payment.amountIdr),
      currency: 'IDR',
      snapToken: redactGateway ? null : payment.snapToken,
      redirectUrl: redactGateway ? null : payment.redirectUrl,
      expiresAt: payment.expiresAt.toISOString(),
      settledAt: payment.settledAt ? payment.settledAt.toISOString() : null,
      failureReason: redactGateway ? null : payment.failureReason,
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

  toAdminOrderSummaryDto(
    order: AdminOrderSummaryRecord,
    options: { piiMasked: boolean },
  ): AdminOrderSummaryDto {
    const base = this.toOrderSummaryDto(order);
    const rawEmail = order.user?.email ?? order.guestEmail ?? null;
    const rawAddress = readAddressSnapshot(order.addressSnapshot);
    const latestPayment = order.payments[0] ?? null;
    const latestShipment = order.shipments[0] ?? null;

    return {
      ...base,
      isGuest: order.userId === null,
      customerEmail: rawEmail
        ? options.piiMasked
          ? maskEmail(rawEmail)
          : rawEmail
        : null,
      recipientName: options.piiMasked
        ? maskPersonName(rawAddress.recipientName)
        : rawAddress.recipientName,
      piiMasked: options.piiMasked,
      latestPaymentStatus: (latestPayment?.status as PaymentStatusInput | undefined) ?? null,
      shipmentStatus: (latestShipment?.status as ShipmentStatusInput | undefined) ?? null,
      latestTrackingNumber: latestShipment?.trackingNumber ?? null,
    };
  }

  toShipmentDto(
    shipment: AdminOrderDetailRecord['shipments'][number],
  ): ShipmentDto {
    const events: ShipmentEventDto[] = shipment.events.map((event) => ({
      id: event.id,
      shipmentId: event.shipmentId,
      status: event.status as ShipmentStatusInput,
      rawCode: event.rawCode,
      description: event.description,
      location: event.location,
      occurredAt: event.occurredAt.toISOString(),
      createdAt: event.createdAt.toISOString(),
    }));

    return {
      id: shipment.id,
      orderId: shipment.orderId,
      warehouseId: shipment.warehouseId,
      warehouseCode: shipment.warehouse?.code,
      provider: shipment.provider,
      serviceCode: shipment.serviceCode,
      providerReference: shipment.providerReference,
      trackingNumber: shipment.trackingNumber,
      labelUrl: shipment.labelUrl,
      status: shipment.status as ShipmentStatusInput,
      shippedAt: shipment.shippedAt ? shipment.shippedAt.toISOString() : null,
      deliveredAt: shipment.deliveredAt ? shipment.deliveredAt.toISOString() : null,
      events,
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString(),
    };
  }

  toAdminOrderDetailDto(
    order: AdminOrderDetailRecord,
    options: { piiMasked: boolean },
  ): AdminOrderDetailDto {
    const piiMasked = options.piiMasked;
    const rawEmail = order.user?.email ?? order.guestEmail ?? null;
    const maskedOrRawEmail = rawEmail
      ? piiMasked
        ? maskEmail(rawEmail)
        : rawEmail
      : null;
    const rawAddress = readAddressSnapshot(order.addressSnapshot);
    const addressSnapshot = piiMasked
      ? maskOrderAddressSnapshot(rawAddress)
      : rawAddress;

    const payments = order.payments.map((payment) =>
      this.toPaymentSummaryDto(payment, { redactGateway: piiMasked }),
    );
    const latestPayment = payments[0] ?? null;

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

    const shipments = order.shipments.map((s) => this.toShipmentDto(s));

    const returns: ReturnDetailDto[] = order.returns.map((ret) => {
      const returnEmailRaw = ret.user?.email ?? rawEmail;
      const returnItems: ReturnItemDto[] = ret.items.map((ri) => ({
        id: ri.id,
        returnId: ri.returnId,
        orderItemId: ri.orderItemId,
        variantId: ri.orderItem.variantId,
        sku: ri.orderItem.skuSnapshot,
        productName: ri.orderItem.productNameSnapshot,
        size: ri.orderItem.sizeSnapshot,
        color: ri.orderItem.colorSnapshot,
        unitPriceIdr: Number(ri.orderItem.unitPriceIdr),
        purchasedQuantity: ri.orderItem.quantity,
        quantity: ri.quantity,
        condition: (ri.condition as ReturnItemConditionInput | null) ?? null,
        restocked: ri.restocked,
        createdAt: ri.createdAt.toISOString(),
      }));

      return {
        id: ret.id,
        orderId: ret.orderId,
        orderNumber: order.orderNumber,
        userId: ret.userId,
        customerEmail: returnEmailRaw
          ? piiMasked
            ? maskEmail(returnEmailRaw)
            : returnEmailRaw
          : null,
        piiMasked,
        status: ret.status as ReturnStatusInput,
        reason: ret.reason,
        customerNotes: ret.customerNotes,
        evidenceKeys: readStringArray(ret.evidenceKeys),
        adminNotes: ret.adminNotes,
        reviewedBy: ret.reviewedBy,
        reviewedAt: ret.reviewedAt ? ret.reviewedAt.toISOString() : null,
        receivedAt: ret.receivedAt ? ret.receivedAt.toISOString() : null,
        items: returnItems,
        createdAt: ret.createdAt.toISOString(),
        updatedAt: ret.updatedAt.toISOString(),
      };
    });

    const refunds: RefundDto[] = order.refunds.map((rf) => ({
      id: rf.id,
      orderId: rf.orderId,
      orderNumber: order.orderNumber,
      paymentId: rf.paymentId,
      returnId: rf.returnId,
      refundKey: rf.refundKey,
      providerRefundId: piiMasked
        ? rf.providerRefundId
          ? 'gateway-redacted'
          : null
        : rf.providerRefundId,
      status: rf.status as RefundStatusInput,
      amountIdr: Number(rf.amountIdr),
      currency: 'IDR',
      reason: rf.reason,
      requestedBy: rf.requestedBy,
      requestedByEmail: rf.requester?.email ?? null,
      approvedBy: rf.approvedBy,
      approvedByEmail: rf.approver?.email ?? null,
      gatewayResponse: piiMasked ? null : readJsonRecord(rf.gatewayResponse),
      completedAt: rf.completedAt ? rf.completedAt.toISOString() : null,
      createdAt: rf.createdAt.toISOString(),
      updatedAt: rf.updatedAt.toISOString(),
    }));

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      isGuest: order.userId === null,
      userId: order.userId,
      guestEmail: order.guestEmail
        ? piiMasked
          ? maskEmail(order.guestEmail)
          : order.guestEmail
        : null,
      customerEmail: maskedOrRawEmail,
      piiMasked,
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
      addressSnapshot,
      items,
      statusHistory,
      latestPayment,
      payments,
      shipments,
      returns,
      refunds,
      paymentExpiresAt: order.paymentExpiresAt.toISOString(),
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }
}
