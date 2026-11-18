import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { OrderAccessService } from './application/services/order-access.service.js';
import { OrdersService } from './application/services/orders.service.js';
import { OrdersMapper } from './infrastructure/mappers/orders.mapper.js';
import { PrismaOrdersRepository } from './infrastructure/repositories/prisma-orders.repository.js';
import { OrdersController } from './presentation/orders.controller.js';

@Module({
  imports: [InventoryModule],
  controllers: [OrdersController],
  providers: [
    OrdersMapper,
    PrismaOrdersRepository,
    OrderAccessService,
    OrdersService,
  ],
  exports: [OrdersMapper, OrderAccessService, PrismaOrdersRepository],
})
export class OrdersModule {}
