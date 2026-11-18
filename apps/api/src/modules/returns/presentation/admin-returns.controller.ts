import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ReturnDetailDto } from '@arven/contracts';
import {
  adminReturnsQuerySchema,
  approveReturnSchema,
  receiveReturnSchema,
  reviewReturnSchema,
  uuidSchema,
  type AdminReturnsQuery,
  type ApproveReturnRequest,
  type ReceiveReturnRequest,
  type ReviewReturnRequest,
} from '@arven/validators';
import type {
  IdempotencyResponseLike,
  PaginatedResponse,
} from '../../../common/http/index.js';
import {
  AdminAuth,
  AuditAction,
  CurrentActor,
  RequirePermissions,
  markAuditRecordedInTransaction,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../../common/security/index.js';
import { ReturnsService } from '../application/services/returns.service.js';

@ApiTags('Admin Returns')
@Controller('admin/returns')
@AdminAuth()
export class AdminReturnsController {
  constructor(
    @Inject(ReturnsService) private readonly returnsService: ReturnsService,
  ) {}

  @Get()
  @RequirePermissions('return.read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List paginated return requests (with SUPPORT PII masking)' })
  async listReturns(
    @CurrentActor() actor: AuthenticatedActor,
    @Query({ schema: adminReturnsQuerySchema }) query: AdminReturnsQuery,
  ): Promise<PaginatedResponse<ReturnDetailDto>> {
    return this.returnsService.listAdminReturns(actor, query);
  }

  @Get(':id')
  @RequirePermissions('return.read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get return detail by ID (with SUPPORT PII masking)' })
  async getReturnById(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<ReturnDetailDto> {
    return this.returnsService.getAdminReturnById(actor, id);
  }

  @Post(':id/review')
  @RequirePermissions('return.review')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @AuditAction('return.reviewed', 'return')
  @ApiOperation({ summary: 'Triage a REQUESTED return into UNDER_REVIEW' })
  async reviewReturn(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: reviewReturnSchema.default({}) }) body: ReviewReturnRequest,
  ): Promise<ReturnDetailDto> {
    markAuditRecordedInTransaction(req);
    return this.returnsService.reviewReturn({
      req,
      actor,
      returnId: id,
      body,
    });
  }

  @Post(':id/approve')
  @RequirePermissions('return.approve')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @AuditAction('return.approved', 'return')
  @ApiOperation({ summary: 'Approve or reject an UNDER_REVIEW return claim' })
  async approveReturn(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: approveReturnSchema }) body: ApproveReturnRequest,
  ): Promise<ReturnDetailDto> {
    markAuditRecordedInTransaction(req);
    return this.returnsService.approveReturn({
      req,
      actor,
      returnId: id,
      body,
    });
  }

  @Post(':id/receive')
  @RequirePermissions('return.inspect')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @AuditAction('return.received', 'return')
  @ApiOperation({
    summary:
      'Physically receive and inspect an APPROVED return, atomically triggering RETURN_TO_STOCK for UNOPENED/GOOD items',
  })
  async receiveReturn(
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: IdempotencyResponseLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: receiveReturnSchema }) body: ReceiveReturnRequest,
  ): Promise<ReturnDetailDto> {
    markAuditRecordedInTransaction(req);
    return this.returnsService.receiveReturn({
      req,
      res,
      actor,
      returnId: id,
      body,
    });
  }
}
