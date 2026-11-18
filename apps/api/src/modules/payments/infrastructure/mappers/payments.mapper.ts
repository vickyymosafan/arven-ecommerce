import { Injectable } from '@nestjs/common';
import type { PaymentSessionDto, RefundDto } from '@arven/contracts';
import type { Prisma } from '@arven/database';
import type { PaymentStatusInput, RefundStatusInput } from '@arven/validators';
import type { PaymentRecord } from '../../../orders/index.js';

export type RefundWithRelations = Prisma.RefundGetPayload<{
  include: {
    order: {
      select: {
        orderNumber: true;
      };
    };
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
}>;

function readGatewayRecord(raw: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

@Injectable()
export class PaymentsMapper {
  toPaymentSessionDto(payment: PaymentRecord, orderNumber: string): PaymentSessionDto {
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      orderNumber,
      provider: payment.provider,
      providerReference: payment.providerReference,
      status: payment.status as PaymentStatusInput,
      amountIdr: Number(payment.amountIdr),
      currency: 'IDR',
      snapToken: payment.snapToken,
      redirectUrl: payment.redirectUrl,
      expiresAt: payment.expiresAt.toISOString(),
    };
  }

  toRefundDto(
    refund: RefundWithRelations,
    options: { redactGateway?: boolean } = {},
  ): RefundDto {
    const redactGateway = Boolean(options.redactGateway);
    return {
      id: refund.id,
      orderId: refund.orderId,
      orderNumber: refund.order.orderNumber,
      paymentId: refund.paymentId,
      returnId: refund.returnId,
      refundKey: refund.refundKey,
      providerRefundId: redactGateway
        ? refund.providerRefundId
          ? 'gateway-redacted'
          : null
        : refund.providerRefundId,
      status: refund.status as RefundStatusInput,
      amountIdr: Number(refund.amountIdr),
      currency: 'IDR',
      reason: refund.reason,
      requestedBy: refund.requestedBy,
      requestedByEmail: refund.requester?.email ?? null,
      approvedBy: refund.approvedBy,
      approvedByEmail: refund.approver?.email ?? null,
      gatewayResponse: redactGateway ? null : readGatewayRecord(refund.gatewayResponse),
      completedAt: refund.completedAt ? refund.completedAt.toISOString() : null,
      createdAt: refund.createdAt.toISOString(),
      updatedAt: refund.updatedAt.toISOString(),
    };
  }
}
