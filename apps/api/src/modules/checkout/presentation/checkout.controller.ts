import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CheckoutQuoteDto, CreateOrderResultDto } from '@arven/contracts';
import {
  checkoutQuoteRequestSchema,
  createOrderRequestSchema,
  type CheckoutQuoteRequest,
  type CreateOrderRequest,
} from '@arven/validators';
import type { IdempotencyResponseLike } from '../../../common/http/index.js';
import {
  AuditAction,
  Public,
  markAuditRecordedInTransaction,
  type HttpRequestLike,
} from '../../../common/security/index.js';
import { CheckoutService } from '../application/services/checkout.service.js';

@ApiTags('Checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(
    @Inject(CheckoutService) private readonly checkoutService: CheckoutService,
  ) {}

  @Post('quote')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Calculate authoritative server-side checkout totals, coupon discount, and shipping rates in IDR',
  })
  async quote(
    @Req() req: HttpRequestLike,
    @Body({ schema: checkoutQuoteRequestSchema }) body: CheckoutQuoteRequest,
  ): Promise<CheckoutQuoteDto> {
    return this.checkoutService.quote(req, body);
  }

  @Post('orders')
  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @AuditAction('order.created', 'order')
  @ApiOperation({
    summary: 'Atomically place an order, reserve inventory, apply coupon, and issue one-time guest order token if anonymous',
  })
  async createOrder(
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: IdempotencyResponseLike,
    @Body({ schema: createOrderRequestSchema }) body: CreateOrderRequest,
  ): Promise<CreateOrderResultDto> {
    markAuditRecordedInTransaction(req);
    return this.checkoutService.createOrder(req, res, body);
  }
}
