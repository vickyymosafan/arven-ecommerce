import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HTTP_HEADERS } from '@arven/config';
import type {
  AdminInventoryLevelDto,
  AdminInventoryMovementDto,
  AdminStockMovementResultDto,
  AdminStockReservationDto,
} from '@arven/contracts';
import {
  adminInventoryLevelsQuerySchema,
  adminInventoryMovementsQuerySchema,
  adminStockReservationsQuerySchema,
  createAdminStockMovementSchema,
  type AdminInventoryLevelsQuery,
  type AdminInventoryMovementsQuery,
  type AdminStockReservationsQuery,
  type CreateAdminStockMovementRequest,
} from '@arven/validators';
import type {
  IdempotencyResponseLike,
  PaginatedResponse,
} from '../../common/http/index.js';
import {
  AdminAuth,
  AuditAction,
  CurrentActor,
  RequireAnyPermission,
  RequirePermissions,
  extractClientIp,
  markAuditRecordedInTransaction,
  type AuthenticatedActor,
} from '../../common/security/index.js';
import { InventoryService } from './inventory.service.js';

type ControllerRequest = Parameters<typeof extractClientIp>[0];

function extractIdempotencyKeyHeader(req: ControllerRequest): string | undefined {
  const raw = req.headers[HTTP_HEADERS.IDEMPOTENCY_KEY];
  return typeof raw === 'string' ? raw : undefined;
}

@ApiTags('Admin Inventory')
@Controller('admin')
@AdminAuth()
export class AdminInventoryController {
  constructor(
    @Inject(InventoryService) private readonly inventoryService: InventoryService,
  ) {}

  @Get('inventory/levels')
  @RequirePermissions('inventory.read')
  @ApiOperation({ summary: 'List inventory levels across warehouses' })
  async listInventoryLevels(
    @Query({ schema: adminInventoryLevelsQuerySchema }) query: AdminInventoryLevelsQuery,
  ): Promise<PaginatedResponse<AdminInventoryLevelDto>> {
    return this.inventoryService.listInventoryLevels(query);
  }

  @Get('inventory/movements')
  @RequirePermissions('inventory.read')
  @ApiOperation({ summary: 'List append-only inventory ledger movements' })
  async listInventoryMovements(
    @Query({ schema: adminInventoryMovementsQuerySchema })
    query: AdminInventoryMovementsQuery,
  ): Promise<PaginatedResponse<AdminInventoryMovementDto>> {
    return this.inventoryService.listInventoryMovements(query);
  }

  @Get('inventory/reservations')
  @RequirePermissions('inventory.read')
  @ApiOperation({ summary: 'List order stock reservations' })
  async listStockReservations(
    @Query({ schema: adminStockReservationsQuerySchema })
    query: AdminStockReservationsQuery,
  ): Promise<PaginatedResponse<AdminStockReservationDto>> {
    return this.inventoryService.listStockReservations(query);
  }

  @Post('stock-movements')
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyPermission('inventory.receive', 'inventory.adjust')
  @AuditAction('inventory.movement.created', 'inventory_level')
  @ApiOperation({ summary: 'Append a manual stock receipt or adjustment movement' })
  async createStockMovement(
    @Req() req: ControllerRequest,
    @Res({ passthrough: true }) res: IdempotencyResponseLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Body({ schema: createAdminStockMovementSchema })
    body: CreateAdminStockMovementRequest,
  ): Promise<AdminStockMovementResultDto> {
    markAuditRecordedInTransaction(req);
    return this.inventoryService.createStockMovement({
      actor,
      body,
      idempotencyKey: extractIdempotencyKeyHeader(req),
      res,
      ipAddress: extractClientIp(req),
    });
  }
}
