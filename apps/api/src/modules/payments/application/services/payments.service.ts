import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { HTTP_HEADERS } from '@arven/config';
import type {
  MidtransWebhookAckDto,
  PaymentSessionDto,
  PaymentSummaryDto,
} from '@arven/contracts';
import { OrderStatus, PaymentStatus } from '@arven/database';
import type {
  CreatePaymentSessionRequest,
  MidtransWebhookPayload,
  PaymentStatusInput,
} from '@arven/validators';
import {
  DomainHttpException,
  IdempotencyService,
  type IdempotencyResponseLike,
} from '../../../../common/http/index.js';
import { extractClientIp, type HttpRequestLike } from '../../../../common/security/index.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type ProviderPaymentStatus,
  type VerifiedWebhookEvent,
} from '../../../../shared/adapters/payment.provider.js';
import { PrismaService } from '../../../../shared/prisma/prisma.service.js';
import { AuditLogService } from '../../../audit-notifications/audit-log.service.js';
import { OutboxWriterService } from '../../../audit-notifications/outbox-writer.service.js';
import { InventoryReservationService } from '../../../inventory/inventory-reservation.service.js';
import { OrderAccessService, OrdersMapper } from '../../../orders/index.js';
import {
  assertOrderEligibleForPaymentSession,
  evaluateWebhookTransition,
  isReusablePendingPayment,
} from '../../domain/entities/payment.entity.js';
import { PaymentsDomainError } from '../../domain/errors/payments-domain.error.js';
import { PAYMENT_EVENT_TYPES } from '../../domain/events/payments.events.js';
import { PaymentsMapper } from '../../infrastructure/mappers/payments.mapper.js';
import { PrismaPaymentsRepository } from '../../infrastructure/repositories/prisma-payments.repository.js';

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
      'Idempotency-Key header (8..128 characters) is required for payment session creation',
    );
  }
  return value;
}

function sanitizeWebhookPayloadForStorage(
  rawPayload: Record<string, unknown>,
): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...rawPayload };
  if ('signature_key' in clone) {
    clone['signature_key'] = '[REDACTED]';
  }
  return clone;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(PrismaPaymentsRepository)
    private readonly paymentsRepo: PrismaPaymentsRepository,
    @Inject(PaymentsMapper)
    private readonly paymentsMapper: PaymentsMapper,
    @Inject(OrdersMapper)
    private readonly ordersMapper: OrdersMapper,
    @Inject(OrderAccessService)
    private readonly orderAccess: OrderAccessService,
    @Inject(InventoryReservationService)
    private readonly inventoryReservation: InventoryReservationService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    @Inject(IdempotencyService)
    private readonly idempotencyService: IdempotencyService,
    @Inject(OutboxWriterService)
    private readonly outboxWriter: OutboxWriterService,
    @Inject(AuditLogService)
    private readonly auditLog: AuditLogService,
  ) {}

  async createPaymentSession(params: {
    req: HttpRequestLike;
    res: IdempotencyResponseLike;
    orderId: string;
    body: CreatePaymentSessionRequest;
    queryToken?: string;
  }): Promise<PaymentSessionDto> {
    const idempotencyKey = readIdempotencyKeyHeader(params.req);
    const credentials = await this.orderAccess.resolveRequiredCredentials(
      params.req,
      params.queryToken,
    );

    return this.idempotencyService.execute<PaymentSessionDto>({
      idempotencyKey,
      actorScope: credentials.actorScope,
      route: `POST:/api/v1/payments/${params.orderId}/session`,
      requestPayload: {
        orderId: params.orderId,
        preferredMethod: params.body.preferredMethod ?? null,
      },
      res: params.res,
      successStatus: HttpStatus.CREATED,
      run: async (tx) => {
        const lockedOrder = await this.paymentsRepo.lockOrderForPaymentSession(
          tx,
          params.orderId,
        );
        const verified = this.orderAccess.assertOrderAccess(lockedOrder, credentials);

        const now = new Date();
        try {
          assertOrderEligibleForPaymentSession(
            lockedOrder!.status,
            lockedOrder!.paymentExpiresAt,
            now,
          );
        } catch (error) {
          if (error instanceof PaymentsDomainError) {
            throw new DomainHttpException(
              error.statusCode,
              error.code,
              error.message,
              error.details,
            );
          }
          throw error;
        }

        const existingPending = await this.paymentsRepo.findLatestPendingPayment(
          tx,
          lockedOrder!.id,
        );
        if (
          existingPending &&
          isReusablePendingPayment(
            existingPending.status,
            existingPending.expiresAt,
            Number(existingPending.amountIdr),
            lockedOrder!.grandTotalIdr,
            now,
          )
        ) {
          return this.paymentsMapper.toPaymentSessionDto(
            existingPending,
            lockedOrder!.orderNumber,
          );
        }

        const { items, customerUser } = await this.paymentsRepo.findOrderItemsAndCustomer(
          tx,
          lockedOrder!.id,
          lockedOrder!.userId,
        );

        const sessionResult = await this.paymentProvider.createSession({
          orderId: lockedOrder!.id,
          orderNumber: lockedOrder!.orderNumber,
          amountIdr: lockedOrder!.grandTotalIdr,
          currency: 'IDR',
          customer: {
            fullName: customerUser?.fullName ?? lockedOrder!.addressRecipientName,
            email:
              customerUser?.email ??
              lockedOrder!.guestEmail ??
              'client-checkout@arven.id',
            phone: customerUser?.phone ?? lockedOrder!.addressPhone,
          },
          items,
          expiresAt: lockedOrder!.paymentExpiresAt,
          idempotencyKey,
        });

        const createdPayment = await this.paymentsRepo.createPaymentRecord(tx, {
          orderId: lockedOrder!.id,
          provider: sessionResult.provider,
          providerReference: sessionResult.providerReference,
          method: params.body.preferredMethod ?? null,
          amountIdr: lockedOrder!.grandTotalIdr,
          snapToken: sessionResult.snapToken ?? null,
          redirectUrl: sessionResult.redirectUrl,
          expiresAt: sessionResult.rawExpiresAt ?? lockedOrder!.paymentExpiresAt,
        });

        await this.outboxWriter.enqueue(
          {
            aggregateType: 'payment',
            aggregateId: createdPayment.id,
            eventType: PAYMENT_EVENT_TYPES.PAYMENT_PENDING,
            payload: {
              paymentId: createdPayment.id,
              orderId: lockedOrder!.id,
              orderNumber: lockedOrder!.orderNumber,
              provider: createdPayment.provider,
              providerReference: createdPayment.providerReference,
              amountIdr: lockedOrder!.grandTotalIdr,
              expiresAt: createdPayment.expiresAt.toISOString(),
            },
          },
          tx,
        );

        await this.auditLog.record(
          {
            actorId: verified.actorId,
            actorRole: verified.actorType,
            action: 'payment.session.created',
            resource: 'payment',
            resourceId: createdPayment.id,
            ipAddress: extractClientIp(params.req),
            afterState: {
              orderId: lockedOrder!.id,
              provider: createdPayment.provider,
              providerReference: createdPayment.providerReference,
              amountIdr: lockedOrder!.grandTotalIdr,
            },
          },
          tx,
        );

        return this.paymentsMapper.toPaymentSessionDto(
          createdPayment,
          lockedOrder!.orderNumber,
        );
      },
    });
  }

  async getPaymentById(params: {
    req: HttpRequestLike;
    paymentId: string;
    queryToken?: string;
  }): Promise<PaymentSummaryDto> {
    const credentials = await this.orderAccess.resolveRequiredCredentials(
      params.req,
      params.queryToken,
    );

    const payment = await this.paymentsRepo.findPaymentWithOrderAccess(params.paymentId);
    if (!payment) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'PAYMENT_NOT_FOUND',
        'Payment not found',
      );
    }

    try {
      this.orderAccess.assertOrderAccess(payment.order, credentials);
    } catch {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'PAYMENT_NOT_FOUND',
        'Payment not found',
      );
    }

    return this.ordersMapper.toPaymentSummaryDto(payment);
  }

  async handleWebhook(params: {
    provider: string;
    req: HttpRequestLike;
    headers: Record<string, string | string[] | undefined>;
    payload: MidtransWebhookPayload;
  }): Promise<MidtransWebhookAckDto> {
    if (params.provider !== 'midtrans') {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'PAYMENT_PROVIDER_NOT_FOUND',
        'Unsupported payment webhook provider',
      );
    }

    let verified: VerifiedWebhookEvent;
    try {
      verified = await this.paymentProvider.verifyWebhook(params.headers, params.payload);
    } catch (error) {
      const refHash = createHash('sha256')
        .update(String(params.payload.order_id ?? 'unknown'))
        .digest('hex')
        .slice(0, 12);
      this.logger.warn(
        `Rejected payment webhook signature verification provider=${params.provider} refHash=${refHash}`,
      );
      throw error;
    }

    const dedup = await this.paymentsRepo.insertWebhookEventDedup({
      provider: params.provider,
      providerEventId: verified.providerEventId,
      eventType: verified.eventType,
      signatureValid: true,
      payload: sanitizeWebhookPayloadForStorage(verified.rawPayload),
    });

    if (dedup.duplicate || !dedup.eventId) {
      return {
        acknowledged: true,
        duplicate: true,
      };
    }

    const eventId = dedup.eventId;
    let providerStatus: ProviderPaymentStatus;
    try {
      providerStatus = await this.paymentProvider.getStatus(verified.providerReference);
    } catch (error) {
      await this.paymentsRepo.deleteUnprocessedWebhookEvent(eventId);
      throw error;
    }

    const clientIp = extractClientIp(params.req);
    const txOutcome = await this.prisma.withTransaction(async (tx) => {
      const locked = await this.paymentsRepo.lockPaymentAndOrderByReference(
        tx,
        verified.providerReference,
      );

      if (!locked) {
        await this.paymentsRepo.markWebhookEventProcessed(tx, {
          eventId,
          paymentId: null,
          processingError: 'PAYMENT_NOT_FOUND',
        });
        await this.auditLog.record(
          {
            actorId: null,
            actorRole: 'WEBHOOK',
            action: 'payment.webhook.orphaned',
            resource: 'payment_event',
            resourceId: eventId,
            ipAddress: clientIp,
            afterState: {
              provider: params.provider,
              providerReference: verified.providerReference,
            },
          },
          tx,
        );
        return { kind: 'NOT_FOUND' as const };
      }

      const transition = evaluateWebhookTransition({
        orderStatus: locked.orderStatus,
        paymentStatus: locked.paymentStatus,
        providerStatus: providerStatus.status,
        providerAmountIdr: providerStatus.grossAmountIdr,
        expectedAmountIdr: locked.paymentAmountIdr,
      });

      if (transition === 'AMOUNT_MISMATCH') {
        const mismatchReason = `PAYMENT_AMOUNT_MISMATCH: expected ${locked.paymentAmountIdr}, provider reported ${providerStatus.grossAmountIdr}`;
        await this.paymentsRepo.markWebhookEventProcessed(tx, {
          eventId,
          paymentId: locked.paymentId,
          processingError: mismatchReason,
        });
        await this.auditLog.record(
          {
            actorId: null,
            actorRole: 'WEBHOOK',
            action: 'payment.amount_mismatch',
            resource: 'payment',
            resourceId: locked.paymentId,
            ipAddress: clientIp,
            afterState: {
              orderId: locked.orderId,
              expectedAmountIdr: locked.paymentAmountIdr,
              providerAmountIdr: providerStatus.grossAmountIdr,
            },
          },
          tx,
        );
        return { kind: 'AMOUNT_MISMATCH' as const, reason: mismatchReason };
      }

      if (transition === 'LATE_SETTLEMENT_CONFLICT') {
        const conflictReason = `MANUAL_REVIEW_REQUIRED: Late settlement received while order was ${locked.orderStatus}`;
        await this.paymentsRepo.flagLateSettlementConflict(tx, {
          paymentId: locked.paymentId,
          method: providerStatus.paymentMethod ?? locked.paymentMethod,
          providerTransactionId:
            providerStatus.providerTransactionId ?? locked.paymentProviderTransactionId,
          reason: conflictReason,
        });
        await this.paymentsRepo.markWebhookEventProcessed(tx, {
          eventId,
          paymentId: locked.paymentId,
          processingError: conflictReason,
        });
        await this.auditLog.record(
          {
            actorId: null,
            actorRole: 'WEBHOOK',
            action: 'payment.late_settlement_conflict',
            resource: 'payment',
            resourceId: locked.paymentId,
            ipAddress: clientIp,
            beforeState: {
              orderStatus: locked.orderStatus,
              paymentStatus: locked.paymentStatus,
            },
            afterState: {
              orderStatus: locked.orderStatus,
              paymentStatus: locked.paymentStatus,
              flaggedForManualReview: true,
              providerStatus: providerStatus.status,
            },
          },
          tx,
        );
        return {
          kind: 'ACK' as const,
          orderNumber: locked.orderNumber,
          paymentStatus: locked.paymentStatus as PaymentStatusInput,
        };
      }

      if (transition === 'SETTLE') {
        const settledAt = providerStatus.settledAt ?? new Date();
        await this.paymentsRepo.updatePaymentAndOrderOnSettlement(tx, {
          paymentId: locked.paymentId,
          orderId: locked.orderId,
          fromOrderStatus: locked.orderStatus as OrderStatus,
          settledAt,
          method: providerStatus.paymentMethod ?? locked.paymentMethod,
          providerTransactionId:
            providerStatus.providerTransactionId ?? locked.paymentProviderTransactionId,
        });

        await this.inventoryReservation.commitOrderReservations(tx, {
          orderId: locked.orderId,
          actorId: null,
        });

        await this.paymentsRepo.markWebhookEventProcessed(tx, {
          eventId,
          paymentId: locked.paymentId,
        });

        await this.outboxWriter.enqueue(
          {
            aggregateType: 'payment',
            aggregateId: locked.paymentId,
            eventType: PAYMENT_EVENT_TYPES.PAYMENT_SUCCEEDED,
            payload: {
              paymentId: locked.paymentId,
              orderId: locked.orderId,
              orderNumber: locked.orderNumber,
              provider: params.provider,
              providerReference: verified.providerReference,
              amountIdr: locked.paymentAmountIdr,
              status: PaymentStatus.SETTLEMENT,
            },
          },
          tx,
        );

        await this.auditLog.record(
          {
            actorId: null,
            actorRole: 'WEBHOOK',
            action: 'payment.settled',
            resource: 'payment',
            resourceId: locked.paymentId,
            ipAddress: clientIp,
            beforeState: {
              orderStatus: locked.orderStatus,
              paymentStatus: locked.paymentStatus,
            },
            afterState: {
              orderStatus: OrderStatus.PAID,
              paymentStatus: PaymentStatus.SETTLEMENT,
            },
          },
          tx,
        );

        return {
          kind: 'ACK' as const,
          orderNumber: locked.orderNumber,
          paymentStatus: PaymentStatus.SETTLEMENT as PaymentStatusInput,
        };
      }

      if (transition === 'AUTHORIZE') {
        await this.paymentsRepo.updatePaymentOnAuthorized(tx, {
          paymentId: locked.paymentId,
          method: providerStatus.paymentMethod ?? locked.paymentMethod,
          providerTransactionId:
            providerStatus.providerTransactionId ?? locked.paymentProviderTransactionId,
        });
        await this.paymentsRepo.markWebhookEventProcessed(tx, {
          eventId,
          paymentId: locked.paymentId,
        });
        return {
          kind: 'ACK' as const,
          orderNumber: locked.orderNumber,
          paymentStatus: PaymentStatus.AUTHORIZED as PaymentStatusInput,
        };
      }

      if (transition === 'FAIL' || transition === 'EXPIRE') {
        const isExpired = transition === 'EXPIRE';
        const targetPaymentStatus = isExpired ? 'EXPIRED' : 'FAILED';
        const targetOrderStatus = isExpired ? 'EXPIRED' : 'CANCELLED';
        const reason = isExpired
          ? 'Payment expired by provider webhook'
          : `Payment ${verified.eventType} by provider webhook`;

        await this.paymentsRepo.updatePaymentAndOrderOnFailureOrExpiry(tx, {
          paymentId: locked.paymentId,
          orderId: locked.orderId,
          fromOrderStatus: locked.orderStatus as OrderStatus,
          targetPaymentStatus,
          targetOrderStatus,
          method: providerStatus.paymentMethod ?? locked.paymentMethod,
          providerTransactionId:
            providerStatus.providerTransactionId ?? locked.paymentProviderTransactionId,
          reason,
        });

        await this.inventoryReservation.releaseOrderReservations(tx, {
          orderId: locked.orderId,
          targetStatus: isExpired ? 'EXPIRED' : 'RELEASED',
          actorId: null,
          reason,
        });

        await this.paymentsRepo.markWebhookEventProcessed(tx, {
          eventId,
          paymentId: locked.paymentId,
        });

        await this.outboxWriter.enqueue(
          {
            aggregateType: 'payment',
            aggregateId: locked.paymentId,
            eventType: PAYMENT_EVENT_TYPES.PAYMENT_FAILED,
            payload: {
              paymentId: locked.paymentId,
              orderId: locked.orderId,
              orderNumber: locked.orderNumber,
              provider: params.provider,
              providerReference: verified.providerReference,
              amountIdr: locked.paymentAmountIdr,
              status: targetPaymentStatus,
              reason,
            },
          },
          tx,
        );

        await this.auditLog.record(
          {
            actorId: null,
            actorRole: 'WEBHOOK',
            action: 'payment.failed',
            resource: 'payment',
            resourceId: locked.paymentId,
            ipAddress: clientIp,
            beforeState: {
              orderStatus: locked.orderStatus,
              paymentStatus: locked.paymentStatus,
            },
            afterState: {
              orderStatus: targetOrderStatus,
              paymentStatus: targetPaymentStatus,
            },
          },
          tx,
        );

        return {
          kind: 'ACK' as const,
          orderNumber: locked.orderNumber,
          paymentStatus: targetPaymentStatus as PaymentStatusInput,
        };
      }

      await this.paymentsRepo.markWebhookEventProcessed(tx, {
        eventId,
        paymentId: locked.paymentId,
      });

      return {
        kind: 'ACK' as const,
        orderNumber: locked.orderNumber,
        paymentStatus: locked.paymentStatus as PaymentStatusInput,
      };
    });

    if (txOutcome.kind === 'NOT_FOUND') {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'PAYMENT_NOT_FOUND',
        'Referenced payment record was not found',
      );
    }

    if (txOutcome.kind === 'AMOUNT_MISMATCH') {
      throw new DomainHttpException(
        HttpStatus.CONFLICT,
        'PAYMENT_AMOUNT_MISMATCH',
        txOutcome.reason,
      );
    }

    return {
      acknowledged: true,
      duplicate: false,
      orderNumber: txOutcome.orderNumber,
      paymentStatus: txOutcome.paymentStatus,
    };
  }
}
