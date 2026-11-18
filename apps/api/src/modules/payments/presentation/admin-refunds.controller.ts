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
import type { RefundDto } from '@arven/contracts';
import {
  adminRefundsQuerySchema,
  approveRefundSchema,
  requestRefundSchema,
  uuidSchema,
  type AdminRefundsQuery,
  type ApproveRefundInput,
  type RequestRefundInput,
} from '@arven/validators';
import type {
  IdempotencyResponseLike,
  PaginatedResponse,
} from '../../../common/http/index.js';
import {
  AdminAuth,
  AuditAction,
  CurrentActor,
  RequireAnyPermission,
  RequireMfaStepUp,
  RequirePermissions,
  markAuditRecordedInTransaction,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../../common/security/index.js';
import { PaymentsService } from '../application/services/payments.service.js';

@ApiTags('Admin Refunds')
@Controller('admin')
@AdminAuth()
export class AdminRefundsController {
  constructor(
    @Inject(PaymentsService) private readonly paymentsService: PaymentsService,
  ) {}

  @Get('refunds')
  @RequireAnyPermission('refund.request', 'refund.approve')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'List dual-step refund requests (with SUPPORT gateway payload redaction)',
  })
  async listRefunds(
    @CurrentActor() actor: AuthenticatedActor,
    @Query({ schema: adminRefundsQuerySchema }) query: AdminRefundsQuery,
  ): Promise<PaginatedResponse<RefundDto>> {
    return this.paymentsService.listAdminRefunds(actor, query);
  }

  @Post('orders/:id/refunds/request')
  @RequirePermissions('refund.request')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @AuditAction('refund.requested', 'refund')
  @ApiOperation({
    summary: 'Step 1 of dual-step refund: request refund bound to settled order payment',
  })
  async requestRefund(
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: IdempotencyResponseLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) orderId: string,
    @Body({ schema: requestRefundSchema }) body: RequestRefundInput,
  ): Promise<RefundDto> {
    markAuditRecordedInTransaction(req);
    return this.paymentsService.requestRefund({
      req,
      res,
      actor,
      orderId,
      body,
    });
  }

  @Post('refunds/:id/approve')
  @RequirePermissions('refund.approve')
  @RequireMfaStepUp(900)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @AuditAction('refund.approved', 'refund')
  @ApiOperation({
    summary:
      'Step 2 of dual-step refund: OWNER-exclusive MFA step-up approval and gateway payout',
  })
  async approveRefund(
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: IdempotencyResponseLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) refundId: string,
    @Body({ schema: approveRefundSchema.default({ decision: 'APPROVE' }) })
    body: ApproveRefundInput,
  ): Promise<RefundDto> {
    markAuditRecordedInTransaction(req);
    return this.paymentsService.approveRefund({
      req,
      res,
      actor,
      refundId,
      body,
    });
  }
}
