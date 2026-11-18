import { Module } from '@nestjs/common';
import { AdminAnalyticsController } from './admin-analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

@Module({
  controllers: [AdminAnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
