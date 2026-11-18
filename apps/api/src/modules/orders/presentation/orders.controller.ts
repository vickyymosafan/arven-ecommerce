import {
  Body,
  Controller,
  Get,
  Header,
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
import type { OrderDetailDto, OrderSummaryDto } from '@arven/contracts';
import {
  cancelOrderRequestSchema,
  listOrdersQuerySchema,
  orderNumberParamSchema,
  uuidSchema,
  type CancelOrderRequest,
  type ListOrdersQuery,
} from '@arven/validators';
import type { IdempotencyResponseLike, PaginatedResponse } from '../../../common/http/index.js';
import {
  AuditAction,
  CurrentActor,
  CustomerAuth,
  Public,
  markAuditRecordedInTransaction,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../../common/security/index.js';
import { OrdersService } from '../application/services/orders.service.js';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  @Get()
  @CustomerAuth()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List paginated orders owned by the authenticated customer' })
  async listOrders(
    @CurrentActor() actor: AuthenticatedActor,
    @Query({ schema: listOrdersQuerySchema }) query: ListOrdersQuery,
  ): Promise<PaginatedResponse<OrderSummaryDto>> {
    return this.ordersService.listCustomerOrders(actor, query);
  }

  @Get(':orderNumber')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get order detail by order number for authenticated owner or X-Guest-Order-Token holder',
  })
  async getOrderByNumber(
    @Req() req: HttpRequestLike,
    @Param('orderNumber', { schema: orderNumberParamSchema.shape.orderNumber })
    orderNumber: string,
    @Query('token') queryToken?: string,
  ): Promise<OrderDetailDto> {
    return this.ordersService.getOrderByNumber({
      req,
      orderNumber,
      queryToken,
    });
  }

  @Post(':id/cancel')
  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @AuditAction('order.cancelled', 'order')
  @ApiOperation({
    summary: 'Idempotently cancel a PENDING_PAYMENT order and release its stock reservations',
  })
  async cancelOrder(
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: IdempotencyResponseLike,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: cancelOrderRequestSchema.default({}) }) body: CancelOrderRequest,
    @Query('token') queryToken?: string,
  ): Promise<OrderDetailDto> {
    markAuditRecordedInTransaction(req);
    return this.ordersService.cancelOrder({
      req,
      res,
      orderId: id,
      body,
      queryToken,
    });
  }
}
