import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { ReturnsService } from './application/services/returns.service.js';
import { ReturnsMapper } from './infrastructure/mappers/returns.mapper.js';
import { PrismaReturnsRepository } from './infrastructure/repositories/prisma-returns.repository.js';
import { AdminReturnsController } from './presentation/admin-returns.controller.js';
import { ReturnsController } from './presentation/returns.controller.js';

@Module({
  imports: [OrdersModule, InventoryModule],
  controllers: [ReturnsController, AdminReturnsController],
  providers: [PrismaReturnsRepository, ReturnsMapper, ReturnsService],
  exports: [ReturnsService, ReturnsMapper],
})
export class ReturnsModule {}
