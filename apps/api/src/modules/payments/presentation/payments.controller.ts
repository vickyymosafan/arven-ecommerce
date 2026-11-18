import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  MidtransWebhookAckDto,
  PaymentSessionDto,
  PaymentSummaryDto,
} from '@arven/contracts';
import {
  createPaymentSessionRequestSchema,
  midtransWebhookPayloadSchema,
  uuidSchema,
  type CreatePaymentSessionRequest,
  type MidtransWebhookPayload,
} from '@arven/validators';
import type { IdempotencyResponseLike } from '../../../common/http/index.js';
import {
  AuditAction,
  Public,
  SkipCsrf,
  markAuditRecordedInTransaction,
  type HttpRequestLike,
} from '../../../common/security/index.js';
import { PaymentsService } from '../application/services/payments.service.js';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly paymentsService: PaymentsService,
  ) {}

  @Post(':orderId/session')
  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @AuditAction('payment.session.created', 'payment')
  @ApiOperation({
    summary: 'Create or reuse an active payment session for a PENDING_PAYMENT order',
  })
  async createSession(
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: IdempotencyResponseLike,
    @Param('orderId', { schema: uuidSchema }) orderId: string,
    @Body({ schema: createPaymentSessionRequestSchema.default({}) })
    body: CreatePaymentSessionRequest,
    @Query('token') queryToken?: string,
  ): Promise<PaymentSessionDto> {
    markAuditRecordedInTransaction(req);
    return this.paymentsService.createPaymentSession({
      req,
      res,
      orderId,
      body,
      queryToken,
    });
  }

  @Get(':id')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get sanitized payment summary for authenticated order owner or guest token holder',
  })
  async getPayment(
    @Req() req: HttpRequestLike,
    @Param('id', { schema: uuidSchema }) id: string,
    @Query('token') queryToken?: string,
  ): Promise<PaymentSummaryDto> {
    return this.paymentsService.getPaymentById({
      req,
      paymentId: id,
      queryToken,
    });
  }

  @Post('webhooks/:provider')
  @Public()
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @AuditAction('payment.webhook.processed', 'payment')
  @ApiOperation({
    summary: 'Process cryptographically verified payment gateway webhooks (Midtrans)',
  })
  async handleWebhook(
    @Req() req: HttpRequestLike,
    @Param('provider') provider: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body({ schema: midtransWebhookPayloadSchema }) body: MidtransWebhookPayload,
  ): Promise<MidtransWebhookAckDto> {
    markAuditRecordedInTransaction(req);
    return this.paymentsService.handleWebhook({
      provider,
      req,
      headers,
      payload: body,
    });
  }
}
