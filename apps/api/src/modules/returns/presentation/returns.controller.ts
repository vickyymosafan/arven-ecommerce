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
import { Throttle } from '@nestjs/throttler';
import type { ReturnDetailDto } from '@arven/contracts';
import {
  createCustomerReturnSchema,
  paginationQuerySchema,
  uuidSchema,
  type CreateCustomerReturnRequest,
} from '@arven/validators';
import type {
  IdempotencyResponseLike,
  PaginatedResponse,
} from '../../../common/http/index.js';
import {
  AuditAction,
  CurrentActor,
  CustomerAuth,
  Public,
  markAuditRecordedInTransaction,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../../common/security/index.js';
import { ReturnsService } from '../application/services/returns.service.js';

@ApiTags('Returns')
@Controller()
export class ReturnsController {
  constructor(
    @Inject(ReturnsService) private readonly returnsService: ReturnsService,
  ) {}

  @Post('orders/:id/returns')
  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @AuditAction('return.requested', 'return')
  @ApiOperation({
    summary: 'Submit a customer or guest return request for a DELIVERED order',
  })
  async createReturn(
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: IdempotencyResponseLike,
    @Param('id', { schema: uuidSchema }) orderId: string,
    @Body({ schema: createCustomerReturnSchema }) body: CreateCustomerReturnRequest,
    @Query('token') queryToken?: string,
  ): Promise<ReturnDetailDto> {
    markAuditRecordedInTransaction(req);
    return this.returnsService.createCustomerReturn({
      req,
      res,
      orderId,
      body,
      queryToken,
    });
  }

  @Get('returns')
  @CustomerAuth()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'List return requests submitted by the authenticated customer',
  })
  async listCustomerReturns(
    @CurrentActor() actor: AuthenticatedActor,
    @Query({ schema: paginationQuerySchema }) query: { page: number; limit: number },
  ): Promise<PaginatedResponse<ReturnDetailDto>> {
    return this.returnsService.listCustomerReturns(actor, query);
  }

  @Get('returns/:id')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get return detail for verified owner, guest token holder, or authorized admin',
  })
  async getReturnById(
    @Req() req: HttpRequestLike,
    @Param('id', { schema: uuidSchema }) returnId: string,
    @Query('token') queryToken?: string,
  ): Promise<ReturnDetailDto> {
    return this.returnsService.getReturnById({
      req,
      returnId,
      queryToken,
    });
  }
}
