import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { HTTP_HEADERS } from '@arven/config';
import type {
  MidtransWebhookAckDto,
  PaymentSessionDto,
  PaymentSummaryDto,
  RefundDto,
} from '@arven/contracts';
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  RefundStatus,
  ReturnStatus,
} from '@arven/database';
import type {
  AdminRefundsQuery,
  ApproveRefundInput,
  CreatePaymentSessionRequest,
  MidtransWebhookPayload,
  PaymentStatusInput,
  RequestRefundInput,
} from '@arven/validators';
import {
  DomainHttpException,
  IdempotencyService,
  type IdempotencyResponseLike,
  type PaginatedResponse,
} from '../../../../common/http/index.js';
import {
  extractClientIp,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../../../common/security/index.js';
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
  RETURN_ELIGIBLE_STATUSES_FOR_REFUND,
  SETTLED_PAYMENT_STATUSES_FOR_REFUND,
  assertOrderEligibleForPaymentSession,
  assertOrderEligibleForRefund,
  assertRefundAmountWithinCeiling,
  assertRefundRequestPendingApproval,
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

  async listAdminRefunds(
    actor: AuthenticatedActor,
    query: AdminRefundsQuery,
  ): Promise<PaginatedResponse<RefundDto>> {
    const redactGateway =
      !actor.permissions.includes('order.read') &&
      !actor.permissions.includes('refund.approve');
    const { rows, total } = await this.paymentsRepo.findManyRefundsAdmin({
      status: query.status as RefundStatus | undefined,
      page: query.page,
      limit: query.limit,
    });

    return {
      items: rows.map((row) =>
        this.paymentsMapper.toRefundDto(row, { redactGateway }),
      ),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async requestRefund(params: {
    req: HttpRequestLike;
    res: IdempotencyResponseLike;
    actor: AuthenticatedActor;
    orderId: string;
    body: RequestRefundInput;
  }): Promise<RefundDto> {
    const { req, res, actor, orderId, body } = params;
    const idempotencyKey = readIdempotencyKeyHeader(req);
    const redactGateway =
      !actor.permissions.includes('order.read') &&
      !actor.permissions.includes('refund.approve');

    return this.idempotencyService.execute<RefundDto>({
      idempotencyKey,
      actorScope: `admin:${actor.userId}`,
      route: `POST:/api/v1/admin/orders/${orderId}/refunds/request`,
      requestPayload: {
        orderId,
        amountIdr: body.amountIdr,
        reason: body.reason,
        returnId: body.returnId ?? null,
      },
      res,
      successStatus: HttpStatus.CREATED,
      run: async (tx) => {
        const lockedOrder = await this.paymentsRepo.lockOrderForRefund(tx, orderId);
        if (!lockedOrder) {
          throw new DomainHttpException(
            HttpStatus.NOT_FOUND,
            'ORDER_NOT_FOUND',
            'Order not found',
          );
        }

        const lockedPayments = await this.paymentsRepo.lockPaymentsForOrder(
          tx,
          lockedOrder.id,
        );
        const settledPayments = lockedPayments.filter((p) =>
          (SETTLED_PAYMENT_STATUSES_FOR_REFUND as readonly string[]).includes(p.status),
        );
        const totalPaidIdr = settledPayments.reduce((sum, p) => sum + p.amountIdr, 0);

        try {
          assertOrderEligibleForRefund(lockedOrder.status, totalPaidIdr);
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

        const targetPayment = settledPayments[0]!;

        if (body.returnId) {
          const returnRecord = await tx.return.findUnique({
            where: { id: body.returnId },
            select: { id: true, orderId: true, status: true },
          });
          if (!returnRecord || returnRecord.orderId !== lockedOrder.id) {
            throw new DomainHttpException(
              HttpStatus.NOT_FOUND,
              'RETURN_NOT_FOUND',
              'Linked return record was not found for this order',
            );
          }
          if (
            !(RETURN_ELIGIBLE_STATUSES_FOR_REFUND as readonly string[]).includes(
              returnRecord.status,
            )
          ) {
            throw new DomainHttpException(
              HttpStatus.CONFLICT,
              'INVALID_RETURN_STATE',
              `Linked return in status ${returnRecord.status} is not eligible for refund`,
            );
          }
        }

        const committedRefundsIdr =
          await this.paymentsRepo.sumCommittedRefundsForOrder(tx, lockedOrder.id);

        try {
          assertRefundAmountWithinCeiling(
            body.amountIdr,
            totalPaidIdr,
            committedRefundsIdr,
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

        const keyDigest = createHash('sha256')
          .update(`${lockedOrder.id}:${actor.userId}:${idempotencyKey}`)
          .digest('hex')
          .slice(0, 16)
          .toUpperCase();
        const refundKey = `RF-${lockedOrder.orderNumber}-${keyDigest}`;

        const created = await tx.refund.create({
          data: {
            orderId: lockedOrder.id,
            paymentId: targetPayment.id,
            returnId: body.returnId ?? null,
            refundKey,
            status: RefundStatus.REQUESTED,
            amountIdr: BigInt(body.amountIdr),
            currency: 'IDR',
            reason: body.reason,
            requestedBy: actor.userId,
            approvedBy: null,
          },
          include: {
            order: { select: { orderNumber: true } },
            requester: { select: { email: true } },
            approver: { select: { email: true } },
          },
        });

        await this.auditLog.record(
          {
            actorId: actor.userId,
            actorRole: actor.roles[0] ?? 'ADMIN',
            action: 'refund.requested',
            resource: 'refund',
            resourceId: created.id,
            ipAddress: extractClientIp(req),
            afterState: {
              orderId: lockedOrder.id,
              paymentId: targetPayment.id,
              returnId: body.returnId ?? null,
              refundKey,
              amountIdr: body.amountIdr,
              reason: body.reason,
              requestedBy: actor.userId,
              status: RefundStatus.REQUESTED,
            },
          },
          tx,
        );

        return this.paymentsMapper.toRefundDto(created, { redactGateway });
      },
    });
  }

  async approveRefund(params: {
    req: HttpRequestLike;
    res: IdempotencyResponseLike;
    actor: AuthenticatedActor;
    refundId: string;
    body: ApproveRefundInput;
  }): Promise<RefundDto> {
    const { req, res, actor, refundId, body } = params;
    const idempotencyKey = readIdempotencyKeyHeader(req);

    return this.idempotencyService.execute<RefundDto>({
      idempotencyKey,
      actorScope: `admin:${actor.userId}`,
      route: `POST:/api/v1/admin/refunds/${refundId}/approve`,
      requestPayload: {
        refundId,
        decision: body.decision,
        notes: body.notes ?? null,
      },
      res,
      successStatus: HttpStatus.OK,
      run: async (tx) => {
        const lockedRefund = await this.paymentsRepo.lockRefundForApproval(
          tx,
          refundId,
        );
        if (!lockedRefund) {
          throw new DomainHttpException(
            HttpStatus.NOT_FOUND,
            'REFUND_NOT_FOUND',
            'Refund request not found',
          );
        }

        try {
          assertRefundRequestPendingApproval(lockedRefund.status);
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

        const lockedOrder = await this.paymentsRepo.lockOrderForRefund(
          tx,
          lockedRefund.orderId,
        );
        if (!lockedOrder) {
          throw new DomainHttpException(
            HttpStatus.NOT_FOUND,
            'ORDER_NOT_FOUND',
            'Parent order not found',
          );
        }

        const lockedPayments = await this.paymentsRepo.lockPaymentsForOrder(
          tx,
          lockedOrder.id,
        );
        const targetPayment = lockedPayments.find(
          (p) => p.id === lockedRefund.paymentId,
        );
        if (!targetPayment) {
          throw new DomainHttpException(
            HttpStatus.NOT_FOUND,
            'PAYMENT_NOT_FOUND',
            'Parent payment not found',
          );
        }

        if (body.decision === 'REJECT') {
          const rejected = await tx.refund.update({
            where: { id: lockedRefund.id },
            data: {
              status: RefundStatus.REJECTED,
              approvedBy: actor.userId,
              gatewayResponse: {
                rejectedNotes: body.notes ?? null,
              } as Prisma.InputJsonValue,
            },
            include: {
              order: { select: { orderNumber: true } },
              requester: { select: { email: true } },
              approver: { select: { email: true } },
            },
          });

          await this.auditLog.record(
            {
              actorId: actor.userId,
              actorRole: actor.roles[0] ?? 'OWNER',
              action: 'refund.rejected',
              resource: 'refund',
              resourceId: lockedRefund.id,
              ipAddress: extractClientIp(req),
              beforeState: {
                status: lockedRefund.status,
              },
              afterState: {
                status: RefundStatus.REJECTED,
                orderId: lockedOrder.id,
                amountIdr: lockedRefund.amountIdr,
                requestedBy: lockedRefund.requestedBy,
                approvedBy: actor.userId,
                notes: body.notes ?? null,
              },
            },
            tx,
          );

          return this.paymentsMapper.toRefundDto(rejected, { redactGateway: false });
        }

        const settledPayments = lockedPayments.filter((p) =>
          (SETTLED_PAYMENT_STATUSES_FOR_REFUND as readonly string[]).includes(p.status),
        );
        const totalPaidIdr = settledPayments.reduce((sum, p) => sum + p.amountIdr, 0);
        const otherCommittedRefundsIdr =
          await this.paymentsRepo.sumCommittedRefundsForOrder(
            tx,
            lockedOrder.id,
            lockedRefund.id,
          );

        try {
          assertOrderEligibleForRefund(lockedOrder.status, totalPaidIdr);
          assertRefundAmountWithinCeiling(
            lockedRefund.amountIdr,
            totalPaidIdr,
            otherCommittedRefundsIdr,
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

        const providerResult = await this.paymentProvider.refund({
          paymentId: targetPayment.id,
          providerReference: targetPayment.providerReference,
          refundKey: lockedRefund.refundKey,
          amountIdr: lockedRefund.amountIdr,
          reason: lockedRefund.reason,
        });

        const gatewayPayload = JSON.parse(
          JSON.stringify(providerResult.rawPayload),
        ) as Prisma.InputJsonValue;

        if (providerResult.status === 'FAILED') {
          const failed = await tx.refund.update({
            where: { id: lockedRefund.id },
            data: {
              status: RefundStatus.FAILED,
              approvedBy: actor.userId,
              providerRefundId: providerResult.providerRefundId,
              gatewayResponse: gatewayPayload,
            },
            include: {
              order: { select: { orderNumber: true } },
              requester: { select: { email: true } },
              approver: { select: { email: true } },
            },
          });

          await this.auditLog.record(
            {
              actorId: actor.userId,
              actorRole: actor.roles[0] ?? 'OWNER',
              action: 'refund.failed',
              resource: 'refund',
              resourceId: lockedRefund.id,
              ipAddress: extractClientIp(req),
              beforeState: { status: lockedRefund.status },
              afterState: {
                status: RefundStatus.FAILED,
                orderId: lockedOrder.id,
                amountIdr: lockedRefund.amountIdr,
                requestedBy: lockedRefund.requestedBy,
                approvedBy: actor.userId,
                providerRefundId: providerResult.providerRefundId,
              },
            },
            tx,
          );

          return this.paymentsMapper.toRefundDto(failed, { redactGateway: false });
        }

        if (providerResult.status === 'PROCESSING') {
          const processing = await tx.refund.update({
            where: { id: lockedRefund.id },
            data: {
              status: RefundStatus.PROCESSING,
              approvedBy: actor.userId,
              providerRefundId: providerResult.providerRefundId,
              gatewayResponse: gatewayPayload,
            },
            include: {
              order: { select: { orderNumber: true } },
              requester: { select: { email: true } },
              approver: { select: { email: true } },
            },
          });

          await tx.payment.update({
            where: { id: targetPayment.id },
            data: { status: PaymentStatus.REFUND_PENDING },
          });
          await tx.order.update({
            where: { id: lockedOrder.id },
            data: { status: OrderStatus.REFUND_PENDING },
          });
          await tx.orderStatusHistory.create({
            data: {
              orderId: lockedOrder.id,
              fromStatus: lockedOrder.status as OrderStatus,
              toStatus: OrderStatus.REFUND_PENDING,
              reason: lockedRefund.reason,
              actorId: actor.userId,
              actorType: 'ADMIN',
            },
          });

          await this.auditLog.record(
            {
              actorId: actor.userId,
              actorRole: actor.roles[0] ?? 'OWNER',
              action: 'refund.approved',
              resource: 'refund',
              resourceId: lockedRefund.id,
              ipAddress: extractClientIp(req),
              beforeState: {
                status: lockedRefund.status,
                orderStatus: lockedOrder.status,
                paymentStatus: targetPayment.status,
              },
              afterState: {
                status: RefundStatus.PROCESSING,
                orderId: lockedOrder.id,
                returnId: lockedRefund.returnId,
                amountIdr: lockedRefund.amountIdr,
                requestedBy: lockedRefund.requestedBy,
                approvedBy: actor.userId,
                providerRefundId: providerResult.providerRefundId,
                orderStatus: OrderStatus.REFUND_PENDING,
                paymentStatus: PaymentStatus.REFUND_PENDING,
              },
            },
            tx,
          );

          return this.paymentsMapper.toRefundDto(processing, { redactGateway: false });
        }

        const now = new Date();
        const priorSucceededTotal =
          await this.paymentsRepo.sumSucceededRefundsForOrder(tx, lockedOrder.id);
        const nextSucceededTotal = priorSucceededTotal + lockedRefund.amountIdr;
        const isFullRefund = nextSucceededTotal >= totalPaidIdr;
        const targetOrderStatus = isFullRefund
          ? OrderStatus.REFUNDED
          : OrderStatus.PARTIALLY_REFUNDED;
        const targetPaymentStatus = isFullRefund
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIALLY_REFUNDED;

        const succeeded = await tx.refund.update({
          where: { id: lockedRefund.id },
          data: {
            status: RefundStatus.SUCCEEDED,
            approvedBy: actor.userId,
            providerRefundId: providerResult.providerRefundId,
            gatewayResponse: gatewayPayload,
            completedAt: now,
          },
          include: {
            order: { select: { orderNumber: true } },
            requester: { select: { email: true } },
            approver: { select: { email: true } },
          },
        });

        await tx.payment.update({
          where: { id: targetPayment.id },
          data: { status: targetPaymentStatus },
        });

        await tx.order.update({
          where: { id: lockedOrder.id },
          data: { status: targetOrderStatus },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId: lockedOrder.id,
            fromStatus: lockedOrder.status as OrderStatus,
            toStatus: targetOrderStatus,
            reason: `Refund approved: ${lockedRefund.reason}`,
            actorId: actor.userId,
            actorType: 'ADMIN',
          },
        });

        if (lockedRefund.returnId) {
          await tx.return.updateMany({
            where: {
              id: lockedRefund.returnId,
              status: { in: [ReturnStatus.APPROVED, ReturnStatus.RECEIVED] },
            },
            data: {
              status: ReturnStatus.REFUNDED,
            },
          });
        }

        await this.outboxWriter.enqueue(
          {
            aggregateType: 'refund',
            aggregateId: lockedRefund.id,
            eventType: PAYMENT_EVENT_TYPES.REFUND_COMPLETED,
            payload: {
              refundId: lockedRefund.id,
              orderId: lockedOrder.id,
              orderNumber: lockedOrder.orderNumber,
              paymentId: targetPayment.id,
              returnId: lockedRefund.returnId,
              amountIdr: lockedRefund.amountIdr,
              requestedBy: lockedRefund.requestedBy,
              approvedBy: actor.userId,
            },
          },
          tx,
        );

        await this.auditLog.record(
          {
            actorId: actor.userId,
            actorRole: actor.roles[0] ?? 'OWNER',
            action: 'refund.approved',
            resource: 'refund',
            resourceId: lockedRefund.id,
            ipAddress: extractClientIp(req),
            beforeState: {
              status: lockedRefund.status,
              orderStatus: lockedOrder.status,
              paymentStatus: targetPayment.status,
            },
            afterState: {
              status: RefundStatus.SUCCEEDED,
              orderId: lockedOrder.id,
              returnId: lockedRefund.returnId,
              amountIdr: lockedRefund.amountIdr,
              requestedBy: lockedRefund.requestedBy,
              approvedBy: actor.userId,
              providerRefundId: providerResult.providerRefundId,
              orderStatus: targetOrderStatus,
              paymentStatus: targetPaymentStatus,
            },
          },
          tx,
        );

        return this.paymentsMapper.toRefundDto(succeeded, { redactGateway: false });
      },
    });
  }
}
