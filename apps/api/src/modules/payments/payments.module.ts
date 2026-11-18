import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsService } from './application/services/payments.service.js';
import { PaymentsMapper } from './infrastructure/mappers/payments.mapper.js';
import { PrismaPaymentsRepository } from './infrastructure/repositories/prisma-payments.repository.js';
import { AdminRefundsController } from './presentation/admin-refunds.controller.js';
import { PaymentsController } from './presentation/payments.controller.js';

@Module({
  imports: [InventoryModule, OrdersModule],
  controllers: [PaymentsController, AdminRefundsController],
  providers: [PrismaPaymentsRepository, PaymentsMapper, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
