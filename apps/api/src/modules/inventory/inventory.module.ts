import { Module } from '@nestjs/common';
import { AdminInventoryController } from './inventory.controller.js';
import { InventoryReservationService } from './inventory-reservation.service.js';
import { InventoryService } from './inventory.service.js';

@Module({
  controllers: [AdminInventoryController],
  providers: [InventoryService, InventoryReservationService],
  exports: [InventoryService, InventoryReservationService],
})
export class InventoryModule {}
