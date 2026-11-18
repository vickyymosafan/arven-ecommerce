import { Controller, Get, Header, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminSalesAnalyticsDto } from '@arven/contracts';
import {
  analyticsSalesQuerySchema,
  type AnalyticsSalesQuery,
} from '@arven/validators';
import {
  AdminAuth,
  CurrentActor,
  RequireAnyPermission,
  type AuthenticatedActor,
} from '../../common/security/index.js';
import { AnalyticsService } from './analytics.service.js';

@ApiTags('Admin Analytics')
@Controller('admin/analytics')
@AdminAuth()
export class AdminAnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly analyticsService: AnalyticsService,
  ) {}

  @Get('sales')
  @RequireAnyPermission('analytics.read', 'analytics.read.limited')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Get server-computed sales & operations analytics (monetary fields suppressed for analytics.read.limited)',
  })
  async getSalesAnalytics(
    @CurrentActor() actor: AuthenticatedActor,
    @Query({ schema: analyticsSalesQuerySchema }) query: AnalyticsSalesQuery,
  ): Promise<AdminSalesAnalyticsDto> {
    return this.analyticsService.getSalesAnalytics(actor, query);
  }
}
