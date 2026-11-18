import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { CheckoutService } from './application/services/checkout.service.js';
import { CheckoutMapper } from './infrastructure/mappers/checkout.mapper.js';
import { PrismaCheckoutRepository } from './infrastructure/repositories/prisma-checkout.repository.js';
import { CheckoutController } from './presentation/checkout.controller.js';

@Module({
  imports: [InventoryModule, OrdersModule],
  controllers: [CheckoutController],
  providers: [PrismaCheckoutRepository, CheckoutMapper, CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
