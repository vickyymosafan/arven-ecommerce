import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  AdminInventoryLevelDto,
  AdminInventoryMovementDto,
  AdminStockMovementResultDto,
  AdminStockReservationDto,
} from '@arven/contracts';
import {
  InventoryMovementType,
  Prisma,
  StockReservationStatus,
  WarehouseStatus,
  type PrismaTransactionClient,
} from '@arven/database';
import type {
  AdminInventoryLevelsQuery,
  AdminInventoryMovementsQuery,
  AdminStockReservationsQuery,
  CreateAdminStockMovementRequest,
  ProductStatusInput,
  StockStatus,
} from '@arven/validators';
import {
  DomainHttpException,
  IdempotencyService,
  type IdempotencyResponseLike,
  type PaginatedResponse,
} from '../../common/http/index.js';
import type { AuthenticatedActor } from '../../common/security/index.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { AuditLogService } from '../audit-notifications/audit-log.service.js';
import { OutboxWriterService } from '../audit-notifications/outbox-writer.service.js';

function escapeLikePattern(raw: string): string {
  return raw.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function computeStockStatus(availableQty: number, lowStockThreshold: number): StockStatus {
  if (availableQty <= 0) {
    return 'OUT_OF_STOCK';
  }
  if (availableQty <= lowStockThreshold) {
    return 'LOW_STOCK';
  }
  return 'IN_STOCK';
}

function mapLevelDto(row: {
  id: string;
  warehouseId: string;
  variantId: string;
  quantityOnHand: number;
  quantityReserved: number;
  lowStockThreshold: number;
  updatedAt: Date;
  warehouse: {
    code: string;
    name: string;
  };
  variant: {
    sku: string;
    color: string;
    colorHex: string | null;
    size: string;
    priceIdr: bigint;
    isActive: boolean;
    product: {
      id: string;
      slug: string;
      name: string;
      status: string;
    };
  };
}): AdminInventoryLevelDto {
  const availableQty = Math.max(0, row.quantityOnHand - row.quantityReserved);
  return {
    id: row.id,
    warehouseId: row.warehouseId,
    warehouseCode: row.warehouse.code,
    warehouseName: row.warehouse.name,
    variantId: row.variantId,
    productId: row.variant.product.id,
    productSlug: row.variant.product.slug,
    productName: row.variant.product.name,
    productStatus: row.variant.product.status as ProductStatusInput,
    sku: row.variant.sku,
    color: row.variant.color,
    colorHex: row.variant.colorHex,
    size: row.variant.size,
    priceIdr: Number(row.variant.priceIdr),
    variantIsActive: row.variant.isActive,
    quantityOnHand: row.quantityOnHand,
    quantityReserved: row.quantityReserved,
    availableQty,
    lowStockThreshold: row.lowStockThreshold,
    stockStatus: computeStockStatus(availableQty, row.lowStockThreshold),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapMovementDto(row: {
  id: string;
  warehouseId: string;
  variantId: string;
  type: InventoryMovementType;
  quantityDelta: number;
  referenceType: string;
  referenceId: string | null;
  reason: string | null;
  actorId: string | null;
  createdAt: Date;
  warehouse: {
    code: string;
    name: string;
  };
  variant: {
    sku: string;
    color: string;
    size: string;
    product: {
      name: string;
    };
  };
  actor: {
    email: string;
  } | null;
}): AdminInventoryMovementDto {
  return {
    id: row.id,
    warehouseId: row.warehouseId,
    warehouseCode: row.warehouse.code,
    warehouseName: row.warehouse.name,
    variantId: row.variantId,
    sku: row.variant.sku,
    productName: row.variant.product.name,
    color: row.variant.color,
    size: row.variant.size,
    type: row.type,
    quantityDelta: row.quantityDelta,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    reason: row.reason,
    actorId: row.actorId,
    actorEmail: row.actor?.email ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapReservationDto(row: {
  id: string;
  orderId: string;
  warehouseId: string;
  variantId: string;
  quantity: number;
  status: StockReservationStatus;
  expiresAt: Date;
  releasedAt: Date | null;
  committedAt: Date | null;
  createdAt: Date;
  order: {
    orderNumber: string;
  } | null;
  warehouse: {
    code: string;
  };
  variant: {
    sku: string;
    color: string;
    size: string;
    product: {
      name: string;
    };
  };
}): AdminStockReservationDto {
  return {
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.order?.orderNumber ?? null,
    warehouseId: row.warehouseId,
    warehouseCode: row.warehouse.code,
    variantId: row.variantId,
    sku: row.variant.sku,
    productName: row.variant.product.name,
    color: row.variant.color,
    size: row.variant.size,
    quantity: row.quantity,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
    committedAt: row.committedAt ? row.committedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface ReturnStockFromInspectionInput {
  warehouseId: string;
  variantId: string;
  quantity: number;
  returnId: string;
  actorId: string | null;
  reason?: string;
}

@Injectable()
export class InventoryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IdempotencyService) private readonly idempotencyService: IdempotencyService,
    @Inject(AuditLogService) private readonly auditLogService: AuditLogService,
    @Inject(OutboxWriterService) private readonly outboxWriterService: OutboxWriterService,
  ) {}

  async listInventoryLevels(
    query: AdminInventoryLevelsQuery,
  ): Promise<PaginatedResponse<AdminInventoryLevelDto>> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`pv.deleted_at IS NULL`,
      Prisma.sql`p.deleted_at IS NULL`,
    ];

    if (query.warehouseCode) {
      conditions.push(Prisma.sql`w.code = ${query.warehouseCode}`);
    }

    if (query.q && query.q.length > 0) {
      const pattern = `%${escapeLikePattern(query.q)}%`;
      conditions.push(
        Prisma.sql`(pv.sku ILIKE ${pattern} ESCAPE '\\' OR p.name ILIKE ${pattern} ESCAPE '\\')`,
      );
    }

    if (query.lowStockOnly) {
      conditions.push(
        Prisma.sql`(il.quantity_on_hand - il.quantity_reserved) <= il.low_stock_threshold`,
      );
    }

    const whereSql = Prisma.join(conditions, ' AND ');
    const skip = (query.page - 1) * query.limit;

    const [countRows, idRows] = await Promise.all([
      this.prisma.client.$queryRaw<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
        FROM inventory_levels il
        INNER JOIN warehouses w ON w.id = il.warehouse_id
        INNER JOIN product_variants pv ON pv.id = il.variant_id
        INNER JOIN products p ON p.id = pv.product_id
        WHERE ${whereSql}
      `,
      this.prisma.client.$queryRaw<Array<{ id: string }>>`
        SELECT il.id
        FROM inventory_levels il
        INNER JOIN warehouses w ON w.id = il.warehouse_id
        INNER JOIN product_variants pv ON pv.id = il.variant_id
        INNER JOIN products p ON p.id = pv.product_id
        WHERE ${whereSql}
        ORDER BY (il.quantity_on_hand - il.quantity_reserved) ASC, pv.sku ASC, w.code ASC
        LIMIT ${query.limit}
        OFFSET ${skip}
      `,
    ]);

    const total = countRows[0]?.total ?? 0;
    const ids = idRows.map((row) => row.id);
    if (ids.length === 0) {
      return {
        items: [],
        page: query.page,
        limit: query.limit,
        total,
      };
    }

    const rows = await this.prisma.client.inventoryLevel.findMany({
      where: { id: { in: ids } },
      include: {
        warehouse: {
          select: {
            code: true,
            name: true,
          },
        },
        variant: {
          select: {
            sku: true,
            color: true,
            colorHex: true,
            size: true,
            priceIdr: true,
            isActive: true,
            product: {
              select: {
                id: true,
                slug: true,
                name: true,
                status: true,
              },
            },
          },
        },
      },
    });

    const rowMap = new Map(rows.map((row) => [row.id, row]));
    const items = ids
      .map((id) => rowMap.get(id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map(mapLevelDto);

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async listInventoryMovements(
    query: AdminInventoryMovementsQuery,
  ): Promise<PaginatedResponse<AdminInventoryMovementDto>> {
    const where: Prisma.InventoryMovementWhereInput = {
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.warehouseCode
        ? { warehouse: { code: query.warehouseCode } }
        : {}),
      ...(query.type ? { type: query.type as InventoryMovementType } : {}),
      ...(query.referenceType ? { referenceType: query.referenceType } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const skip = (query.page - 1) * query.limit;
    const [total, rows] = await Promise.all([
      this.prisma.client.inventoryMovement.count({ where }),
      this.prisma.client.inventoryMovement.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          warehouse: {
            select: {
              code: true,
              name: true,
            },
          },
          variant: {
            select: {
              sku: true,
              color: true,
              size: true,
              product: {
                select: {
                  name: true,
                },
              },
            },
          },
          actor: {
            select: {
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      items: rows.map(mapMovementDto),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async listStockReservations(
    query: AdminStockReservationsQuery,
  ): Promise<PaginatedResponse<AdminStockReservationDto>> {
    const where: Prisma.StockReservationWhereInput = {
      ...(query.status ? { status: query.status as StockReservationStatus } : {}),
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.warehouseCode
        ? { warehouse: { code: query.warehouseCode } }
        : {}),
    };

    const skip = (query.page - 1) * query.limit;
    const [total, rows] = await Promise.all([
      this.prisma.client.stockReservation.count({ where }),
      this.prisma.client.stockReservation.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          order: {
            select: {
              orderNumber: true,
            },
          },
          warehouse: {
            select: {
              code: true,
            },
          },
          variant: {
            select: {
              sku: true,
              color: true,
              size: true,
              product: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      items: rows.map(mapReservationDto),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async createStockMovement(params: {
    actor: AuthenticatedActor;
    body: CreateAdminStockMovementRequest;
    idempotencyKey: string | undefined;
    res: IdempotencyResponseLike;
    ipAddress: string | null;
  }): Promise<AdminStockMovementResultDto> {
    const { actor, body, idempotencyKey, res, ipAddress } = params;

    if (body.type === 'RECEIPT' && !actor.permissions.includes('inventory.receive')) {
      throw new DomainHttpException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Insufficient permissions for stock receipt',
      );
    }

    if (body.type === 'ADJUSTMENT' && !actor.permissions.includes('inventory.adjust')) {
      throw new DomainHttpException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Insufficient permissions for stock adjustment',
      );
    }

    return this.idempotencyService.execute<AdminStockMovementResultDto>({
      idempotencyKey,
      actorScope: `admin:${actor.userId}`,
      route: 'POST:/api/v1/admin/stock-movements',
      requestPayload: body,
      res,
      successStatus: HttpStatus.CREATED,
      run: async (tx) => {
        const warehouse = await tx.warehouse.findUnique({
          where: { code: body.warehouseCode },
        });
        if (!warehouse) {
          throw new DomainHttpException(
            HttpStatus.NOT_FOUND,
            'WAREHOUSE_NOT_FOUND',
            `Warehouse "${body.warehouseCode}" was not found`,
          );
        }
        if (warehouse.status !== WarehouseStatus.ACTIVE) {
          throw new DomainHttpException(
            HttpStatus.BAD_REQUEST,
            'WAREHOUSE_INACTIVE',
            `Warehouse "${body.warehouseCode}" is not active`,
          );
        }

        const variant = await tx.productVariant.findFirst({
          where: {
            id: body.variantId,
            deletedAt: null,
          },
          include: {
            product: {
              select: {
                id: true,
                deletedAt: true,
              },
            },
          },
        });
        if (!variant || variant.product.deletedAt !== null) {
          throw new DomainHttpException(
            HttpStatus.NOT_FOUND,
            'VARIANT_NOT_FOUND',
            'Product variant was not found',
          );
        }

        type LockedInventoryRow = {
          id: string;
          quantity_on_hand: number;
          quantity_reserved: number;
          low_stock_threshold: number;
        };

        let lockedRows = await tx.$queryRaw<LockedInventoryRow[]>`
          SELECT id, quantity_on_hand, quantity_reserved, low_stock_threshold
          FROM inventory_levels
          WHERE warehouse_id = ${warehouse.id}::uuid
            AND variant_id = ${variant.id}::uuid
          FOR UPDATE
        `;

        if (lockedRows.length === 0) {
          if (body.quantityDelta < 0) {
            throw new DomainHttpException(
              HttpStatus.CONFLICT,
              'INSUFFICIENT_STOCK',
              'Insufficient stock for negative adjustment on uninitialized inventory level',
            );
          }

          await tx.$executeRaw`
            INSERT INTO inventory_levels (warehouse_id, variant_id, quantity_on_hand, quantity_reserved)
            VALUES (${warehouse.id}::uuid, ${variant.id}::uuid, 0, 0)
            ON CONFLICT (warehouse_id, variant_id) DO NOTHING
          `;

          lockedRows = await tx.$queryRaw<LockedInventoryRow[]>`
            SELECT id, quantity_on_hand, quantity_reserved, low_stock_threshold
            FROM inventory_levels
            WHERE warehouse_id = ${warehouse.id}::uuid
              AND variant_id = ${variant.id}::uuid
            FOR UPDATE
          `;
        }

        const lockedLevel = lockedRows[0];
        if (!lockedLevel) {
          throw new DomainHttpException(
            HttpStatus.CONFLICT,
            'INSUFFICIENT_STOCK',
            'Unable to lock inventory level row',
          );
        }

        const currentOnHand = lockedLevel.quantity_on_hand;
        const currentReserved = lockedLevel.quantity_reserved;
        const nextOnHand = currentOnHand + body.quantityDelta;

        if (nextOnHand < 0 || nextOnHand < currentReserved) {
          throw new DomainHttpException(
            HttpStatus.CONFLICT,
            'INSUFFICIENT_STOCK',
            `Stock adjustment would result in ${nextOnHand} on hand, below zero or reserved quantity (${currentReserved})`,
          );
        }

        const updatedLevel = await tx.inventoryLevel.update({
          where: { id: lockedLevel.id },
          data: { quantityOnHand: nextOnHand },
          include: {
            warehouse: {
              select: {
                code: true,
                name: true,
              },
            },
            variant: {
              select: {
                sku: true,
                color: true,
                colorHex: true,
                size: true,
                priceIdr: true,
                isActive: true,
                product: {
                  select: {
                    id: true,
                    slug: true,
                    name: true,
                    status: true,
                  },
                },
              },
            },
          },
        });

        const movement = await tx.inventoryMovement.create({
          data: {
            warehouseId: warehouse.id,
            variantId: variant.id,
            type: body.type as InventoryMovementType,
            quantityDelta: body.quantityDelta,
            referenceType: body.referenceType,
            referenceId: body.referenceId ?? null,
            reason: body.reason ?? null,
            actorId: actor.userId,
          },
          include: {
            warehouse: {
              select: {
                code: true,
                name: true,
              },
            },
            variant: {
              select: {
                sku: true,
                color: true,
                size: true,
                product: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            actor: {
              select: {
                email: true,
              },
            },
          },
        });

        await this.auditLogService.record(
          {
            actorId: actor.userId,
            actorRole: actor.roles[0] ?? null,
            action: 'inventory.movement.created',
            resource: 'inventory_level',
            resourceId: updatedLevel.id,
            ipAddress,
            beforeState: {
              warehouseId: warehouse.id,
              warehouseCode: warehouse.code,
              variantId: variant.id,
              sku: variant.sku,
              quantityOnHand: currentOnHand,
              quantityReserved: currentReserved,
            },
            afterState: {
              movementId: movement.id,
              type: movement.type,
              quantityDelta: movement.quantityDelta,
              referenceType: movement.referenceType,
              referenceId: movement.referenceId,
              reason: movement.reason,
              quantityOnHand: nextOnHand,
              quantityReserved: currentReserved,
            },
          },
          tx,
        );

        if (body.type === 'RECEIPT') {
          await this.outboxWriterService.enqueue(
            {
              aggregateType: 'inventory_level',
              aggregateId: updatedLevel.id,
              eventType: 'inventory.received',
              payload: {
                movementId: movement.id,
                warehouseId: warehouse.id,
                warehouseCode: warehouse.code,
                variantId: variant.id,
                sku: variant.sku,
                quantityDelta: body.quantityDelta,
                quantityOnHand: nextOnHand,
              },
            },
            tx,
          );
        }

        return {
          movement: mapMovementDto(movement),
          level: mapLevelDto(updatedLevel),
        };
      },
    });
  }

  /**
   * Atomically increments sellable on-hand stock from an approved return inspection
   * and appends an immutable RETURN_TO_STOCK ledger entry within the caller transaction.
   */
  async returnStockFromInspection(
    tx: PrismaTransactionClient,
    input: ReturnStockFromInspectionInput,
  ): Promise<{ inventoryLevelId: string; movementId: string }> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new DomainHttpException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Return restock quantity must be a positive integer',
        [{ field: 'quantity', issue: 'Quantity must be a positive integer' }],
      );
    }

    const updatedLevels = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "inventory_levels" ("warehouse_id", "variant_id", "quantity_on_hand", "quantity_reserved")
      VALUES (${input.warehouseId}::uuid, ${input.variantId}::uuid, ${input.quantity}::int, 0)
      ON CONFLICT ("warehouse_id", "variant_id")
      DO UPDATE SET
        "quantity_on_hand" = "inventory_levels"."quantity_on_hand" + ${input.quantity}::int,
        "updated_at" = NOW()
      RETURNING "id"::text AS "id"
    `;

    const levelRow = updatedLevels[0];
    if (!levelRow) {
      throw new DomainHttpException(
        HttpStatus.CONFLICT,
        'INVENTORY_RESTOCK_FAILED',
        'Unable to increment inventory level for return restock',
      );
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        warehouseId: input.warehouseId,
        variantId: input.variantId,
        type: InventoryMovementType.RETURN_TO_STOCK,
        quantityDelta: input.quantity,
        referenceType: 'RETURN',
        referenceId: input.returnId,
        reason: input.reason ?? 'Return inspection passed',
        actorId: input.actorId,
      },
      select: { id: true },
    });

    return {
      inventoryLevelId: levelRow.id,
      movementId: movement.id,
    };
  }
}
