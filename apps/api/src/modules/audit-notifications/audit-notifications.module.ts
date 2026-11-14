import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service.js';
import { AuditNotificationsAdminController } from './audit-notifications-admin.controller.js';
import { OutboxWriterService } from './outbox-writer.service.js';

@Global()
@Module({
  controllers: [AuditNotificationsAdminController],
  providers: [AuditLogService, OutboxWriterService],
  exports: [AuditLogService, OutboxWriterService],
})
export class AuditNotificationsModule {}
