import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from '../../common/http/idempotency.service.js';
import { AuditLogService } from './audit-log.service.js';
import { AuditNotificationsAdminController } from './audit-notifications-admin.controller.js';
import { OutboxWriterService } from './outbox-writer.service.js';

@Global()
@Module({
  controllers: [AuditNotificationsAdminController],
  providers: [AuditLogService, OutboxWriterService, IdempotencyService],
  exports: [AuditLogService, OutboxWriterService, IdempotencyService],
})
export class AuditNotificationsModule {}
