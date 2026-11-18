import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { AdminShippingController } from './admin-shipping.controller.js';
import { ShippingMapper } from './shipping.mapper.js';
import { ShippingService } from './shipping.service.js';

@Module({
  imports: [OrdersModule],
  controllers: [AdminShippingController],
  providers: [ShippingMapper, ShippingService],
  exports: [ShippingService, ShippingMapper],
})
export class ShippingModule {}
