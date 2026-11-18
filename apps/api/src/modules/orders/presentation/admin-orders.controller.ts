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
import type { AdminOrderDetailDto, AdminOrderSummaryDto } from '@arven/contracts';
import {
  adminOrdersQuerySchema,
  adminTransitionOrderSchema,
  uuidSchema,
  type AdminOrdersQuery,
  type AdminTransitionOrderRequest,
} from '@arven/validators';
import type { IdempotencyResponseLike, PaginatedResponse } from '../../../common/http/index.js';
import {
  AdminAuth,
  AuditAction,
  CurrentActor,
  RequireAnyPermission,
  markAuditRecordedInTransaction,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../../common/security/index.js';
import { OrdersService } from '../application/services/orders.service.js';

@ApiTags('Admin Orders')
@Controller('admin/orders')
@AdminAuth()
export class AdminOrdersController {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  @Get()
  @RequireAnyPermission('order.read', 'order.read.limited')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'List paginated orders for admin operations (with SUPPORT PII masking)',
  })
  async listOrders(
    @CurrentActor() actor: AuthenticatedActor,
    @Query({ schema: adminOrdersQuerySchema }) query: AdminOrdersQuery,
  ): Promise<PaginatedResponse<AdminOrderSummaryDto>> {
    return this.ordersService.listAdminOrders(actor, query);
  }

  @Get(':id')
  @RequireAnyPermission('order.read', 'order.read.limited')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get full admin order detail (with SUPPORT PII masking & gateway redaction)',
  })
  async getOrderById(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<AdminOrderDetailDto> {
    return this.ordersService.getAdminOrderById(actor, id);
  }

  @Post(':id/transition')
  @RequireAnyPermission('order.fulfill', 'order.cancel')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @AuditAction('order.status_transitioned', 'order')
  @ApiOperation({
    summary: 'Transition order fulfillment or cancel status with strict RBAC and stock release',
  })
  async transitionOrder(
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: IdempotencyResponseLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: adminTransitionOrderSchema }) body: AdminTransitionOrderRequest,
  ): Promise<AdminOrderDetailDto> {
    markAuditRecordedInTransaction(req);
    return this.ordersService.transitionAdminOrder({
      req,
      res,
      actor,
      orderId: id,
      body,
    });
  }
}
