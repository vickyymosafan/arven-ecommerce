import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { OrderAccessService } from './application/services/order-access.service.js';
import { OrdersService } from './application/services/orders.service.js';
import { OrdersMapper } from './infrastructure/mappers/orders.mapper.js';
import { PrismaOrdersRepository } from './infrastructure/repositories/prisma-orders.repository.js';
import { AdminOrdersController } from './presentation/admin-orders.controller.js';
import { OrdersController } from './presentation/orders.controller.js';

@Module({
  imports: [InventoryModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [
    OrdersMapper,
    PrismaOrdersRepository,
    OrderAccessService,
    OrdersService,
  ],
  exports: [OrdersMapper, OrderAccessService, PrismaOrdersRepository, OrdersService],
})
export class OrdersModule {}
