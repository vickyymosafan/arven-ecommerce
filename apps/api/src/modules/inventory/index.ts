export { InventoryModule } from './inventory.module.js';
export {
  InventoryService,
  type ReturnStockFromInspectionInput,
} from './inventory.service.js';
export {
  InventoryReservationService,
  type CommitOrderReservationsInput,
  type ReleaseOrderReservationsInput,
  type ReserveStockForOrderInput,
  type ReserveStockItemInput,
} from './inventory-reservation.service.js';
export { AdminInventoryController } from './inventory.controller.js';
