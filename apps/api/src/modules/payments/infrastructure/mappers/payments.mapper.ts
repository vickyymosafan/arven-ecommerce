import { Injectable } from '@nestjs/common';
import type { PaymentSessionDto } from '@arven/contracts';
import type { PaymentStatusInput } from '@arven/validators';
import type { PaymentRecord } from '../../../orders/index.js';

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
}
