import { HttpStatus, Injectable } from '@nestjs/common';
import {
  InventoryMovementType,
  StockReservationStatus,
  type PrismaTransactionClient,
} from '@arven/database';
import { DomainHttpException } from '../../common/http/index.js';

export interface ReserveStockItemInput {
  variantId: string;
  quantity: number;
}

export interface ReserveStockForOrderInput {
  orderId: string;
  warehouseId: string;
  items: ReadonlyArray<ReserveStockItemInput>;
  expiresAt: Date;
  actorId?: string | null;
}

export interface CommitOrderReservationsInput {
  orderId: string;
  actorId?: string | null;
}

export interface ReleaseOrderReservationsInput {
  orderId: string;
  targetStatus: 'RELEASED' | 'EXPIRED';
  actorId?: string | null;
  reason?: string;
}

interface LockedReservationRow {
  id: string;
  warehouseId: string;
  variantId: string;
  quantity: number;
  status: string;
}

function compareAsciiAsc(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

@Injectable()
export class InventoryReservationService {
  async reserveStockForOrder(
    tx: PrismaTransactionClient,
    input: ReserveStockForOrderInput,
  ): Promise<void> {
    const aggregated = new Map<string, number>();
    for (const item of input.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Reservation quantity must be a positive integer',
          [{ field: 'items.quantity', issue: `Invalid quantity for variant ${item.variantId}` }],
        );
      }
      aggregated.set(item.variantId, (aggregated.get(item.variantId) ?? 0) + item.quantity);
    }

    const sortedItems = Array.from(aggregated.entries())
      .map(([variantId, quantity]) => ({ variantId, quantity }))
      .sort((a, b) => compareAsciiAsc(a.variantId, b.variantId));

    for (const item of sortedItems) {
      const updated = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "inventory_levels"
        SET "quantity_reserved" = "quantity_reserved" + ${item.quantity}::int,
            "updated_at" = NOW()
        WHERE "warehouse_id" = ${input.warehouseId}::uuid
          AND "variant_id" = ${item.variantId}::uuid
          AND ("quantity_on_hand" - "quantity_reserved") >= ${item.quantity}::int
        RETURNING "id"
      `;

      if (updated.length === 0) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'VARIANT_OUT_OF_STOCK',
          'Insufficient available stock to reserve order item',
          [{ field: 'items.variantId', issue: `Insufficient stock for variant ${item.variantId}` }],
        );
      }

      await tx.stockReservation.create({
        data: {
          orderId: input.orderId,
          warehouseId: input.warehouseId,
          variantId: item.variantId,
          quantity: item.quantity,
          status: StockReservationStatus.ACTIVE,
          expiresAt: input.expiresAt,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          warehouseId: input.warehouseId,
          variantId: item.variantId,
          type: InventoryMovementType.RESERVATION,
          quantityDelta: item.quantity,
          referenceType: 'order',
          referenceId: input.orderId,
          reason: 'Order checkout stock reservation',
          actorId: input.actorId ?? null,
        },
      });
    }
  }

  async commitOrderReservations(
    tx: PrismaTransactionClient,
    input: CommitOrderReservationsInput,
  ): Promise<number> {
    const lockedRows = await tx.$queryRaw<Array<LockedReservationRow>>`
      SELECT
        "id"::text AS "id",
        "warehouse_id"::text AS "warehouseId",
        "variant_id"::text AS "variantId",
        "quantity",
        "status"::text AS "status"
      FROM "stock_reservations"
      WHERE "order_id" = ${input.orderId}::uuid
      ORDER BY "variant_id" ASC
      FOR UPDATE
    `;

    const activeRows = lockedRows.filter(
      (row) => row.status === StockReservationStatus.ACTIVE,
    );
    if (activeRows.length === 0) {
      throw new DomainHttpException(
        HttpStatus.CONFLICT,
        'RESERVATION_NOT_ACTIVE',
        'No active stock reservations found to commit for order',
      );
    }

    const now = new Date();
    for (const row of activeRows) {
      const updatedReservation = await tx.stockReservation.updateMany({
        where: {
          id: row.id,
          status: StockReservationStatus.ACTIVE,
        },
        data: {
          status: StockReservationStatus.COMMITTED,
          committedAt: now,
        },
      });

      if (updatedReservation.count !== 1) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'RESERVATION_STATE_CONFLICT',
          'Stock reservation state changed concurrently during commit',
        );
      }

      const updatedLevel = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "inventory_levels"
        SET "quantity_on_hand" = "quantity_on_hand" - ${row.quantity}::int,
            "quantity_reserved" = "quantity_reserved" - ${row.quantity}::int,
            "updated_at" = NOW()
        WHERE "warehouse_id" = ${row.warehouseId}::uuid
          AND "variant_id" = ${row.variantId}::uuid
          AND "quantity_reserved" >= ${row.quantity}::int
          AND "quantity_on_hand" >= ${row.quantity}::int
        RETURNING "id"
      `;

      if (updatedLevel.length === 0) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'INVENTORY_COMMIT_FAILED',
          'Unable to deduct inventory level during reservation commit',
          [{ field: 'variantId', issue: `Commit failed for variant ${row.variantId}` }],
        );
      }

      await tx.inventoryMovement.create({
        data: {
          warehouseId: row.warehouseId,
          variantId: row.variantId,
          type: InventoryMovementType.SALE,
          quantityDelta: -row.quantity,
          referenceType: 'order',
          referenceId: input.orderId,
          reason: 'Order payment settled',
          actorId: input.actorId ?? null,
        },
      });
    }

    return activeRows.length;
  }

  async releaseOrderReservations(
    tx: PrismaTransactionClient,
    input: ReleaseOrderReservationsInput,
  ): Promise<number> {
    const targetPrismaStatus =
      input.targetStatus === 'EXPIRED'
        ? StockReservationStatus.EXPIRED
        : StockReservationStatus.RELEASED;

    const lockedRows = await tx.$queryRaw<Array<LockedReservationRow>>`
      SELECT
        "id"::text AS "id",
        "warehouse_id"::text AS "warehouseId",
        "variant_id"::text AS "variantId",
        "quantity",
        "status"::text AS "status"
      FROM "stock_reservations"
      WHERE "order_id" = ${input.orderId}::uuid
      ORDER BY "variant_id" ASC
      FOR UPDATE
    `;

    const activeRows = lockedRows.filter(
      (row) => row.status === StockReservationStatus.ACTIVE,
    );
    if (activeRows.length === 0) {
      return 0;
    }

    const now = new Date();
    const defaultReason =
      input.targetStatus === 'EXPIRED'
        ? 'Order payment reservation expired'
        : 'Order reservation released';

    for (const row of activeRows) {
      const updatedReservation = await tx.stockReservation.updateMany({
        where: {
          id: row.id,
          status: StockReservationStatus.ACTIVE,
        },
        data: {
          status: targetPrismaStatus,
          releasedAt: now,
        },
      });

      if (updatedReservation.count !== 1) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'RESERVATION_STATE_CONFLICT',
          'Stock reservation state changed concurrently during release',
        );
      }

      const updatedLevel = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "inventory_levels"
        SET "quantity_reserved" = "quantity_reserved" - ${row.quantity}::int,
            "updated_at" = NOW()
        WHERE "warehouse_id" = ${row.warehouseId}::uuid
          AND "variant_id" = ${row.variantId}::uuid
          AND "quantity_reserved" >= ${row.quantity}::int
        RETURNING "id"
      `;

      if (updatedLevel.length === 0) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'INVENTORY_RELEASE_FAILED',
          'Unable to release reserved stock quantity',
          [{ field: 'variantId', issue: `Release failed for variant ${row.variantId}` }],
        );
      }

      await tx.inventoryMovement.create({
        data: {
          warehouseId: row.warehouseId,
          variantId: row.variantId,
          type: InventoryMovementType.RELEASE,
          quantityDelta: -row.quantity,
          referenceType: 'order',
          referenceId: input.orderId,
          reason: input.reason ?? defaultReason,
          actorId: input.actorId ?? null,
        },
      });
    }

    return activeRows.length;
  }
}
