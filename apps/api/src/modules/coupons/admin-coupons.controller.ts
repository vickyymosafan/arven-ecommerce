import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminCouponDto } from '@arven/contracts';
import {
  adminCouponsQuerySchema,
  createCouponSchema,
  updateCouponSchema,
  uuidSchema,
  type AdminCouponsQuery,
  type CreateCouponRequest,
  type UpdateCouponRequest,
} from '@arven/validators';
import type { PaginatedResponse } from '../../common/http/index.js';
import {
  AdminAuth,
  AuditAction,
  CurrentActor,
  RequirePermissions,
  markAuditRecordedInTransaction,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../common/security/index.js';
import { CouponsService } from './coupons.service.js';

@ApiTags('Admin Coupons')
@Controller('admin/coupons')
@AdminAuth()
export class AdminCouponsController {
  constructor(
    @Inject(CouponsService) private readonly couponsService: CouponsService,
  ) {}

  @Get()
  @RequirePermissions('coupon.read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List promotional coupons with filtering and pagination' })
  async listCoupons(
    @Query({ schema: adminCouponsQuerySchema }) query: AdminCouponsQuery,
  ): Promise<PaginatedResponse<AdminCouponDto>> {
    return this.couponsService.listCoupons(query);
  }

  @Post()
  @RequirePermissions('coupon.manage')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @AuditAction('coupon.created', 'coupon')
  @ApiOperation({ summary: 'Create a new promotional coupon' })
  async createCoupon(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Body({ schema: createCouponSchema }) body: CreateCouponRequest,
  ): Promise<AdminCouponDto> {
    markAuditRecordedInTransaction(req);
    return this.couponsService.createCoupon(req, actor, body);
  }

  @Patch(':id')
  @RequirePermissions('coupon.manage')
  @Header('Cache-Control', 'no-store')
  @AuditAction('coupon.updated', 'coupon')
  @ApiOperation({ summary: 'Update a promotional coupon with cross-field validation' })
  async updateCoupon(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateCouponSchema }) body: UpdateCouponRequest,
  ): Promise<AdminCouponDto> {
    markAuditRecordedInTransaction(req);
    return this.couponsService.updateCoupon(req, actor, id, body);
  }

  @Delete(':id')
  @RequirePermissions('coupon.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @AuditAction('coupon.archived', 'coupon')
  @ApiOperation({ summary: 'Archive a promotional coupon' })
  async deleteCoupon(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.couponsService.deleteCoupon(req, actor, id);
  }
}
