import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ShipmentDto } from '@arven/contracts';
import {
  adminCreateShipmentSchema,
  uuidSchema,
  type AdminCreateShipmentRequest,
} from '@arven/validators';
import type { IdempotencyResponseLike } from '../../common/http/index.js';
import {
  AdminAuth,
  AuditAction,
  CurrentActor,
  RequirePermissions,
  markAuditRecordedInTransaction,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../common/security/index.js';
import { ShippingService } from './shipping.service.js';

@ApiTags('Admin Shipping')
@Controller('admin')
@AdminAuth()
export class AdminShippingController {
  constructor(
    @Inject(ShippingService) private readonly shippingService: ShippingService,
  ) {}

  @Post('orders/:id/shipments')
  @RequirePermissions('order.fulfill')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @AuditAction('shipment.created', 'shipment')
  @ApiOperation({
    summary: 'Create carrier shipment, dispatch order, and emit shipment.dispatched outbox event',
  })
  async createShipment(
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: IdempotencyResponseLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) orderId: string,
    @Body({ schema: adminCreateShipmentSchema }) body: AdminCreateShipmentRequest,
  ): Promise<ShipmentDto> {
    markAuditRecordedInTransaction(req);
    return this.shippingService.createShipment({
      req,
      res,
      actor,
      orderId,
      body,
    });
  }

  @Post('shipments/:id/sync-tracking')
  @RequirePermissions('order.fulfill')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @AuditAction('shipment.tracking_synced', 'shipment')
  @ApiOperation({
    summary: 'Synchronize carrier tracking events and advance shipment/order delivery state',
  })
  async syncTracking(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) shipmentId: string,
  ): Promise<ShipmentDto> {
    markAuditRecordedInTransaction(req);
    return this.shippingService.syncTracking({
      req,
      actor,
      shipmentId,
    });
  }
}
