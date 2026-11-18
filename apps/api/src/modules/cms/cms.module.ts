import { Module } from '@nestjs/common';
import { AdminCmsController } from './admin-cms.controller.js';
import { CmsPublicController } from './cms-public.controller.js';
import { CmsService } from './cms.service.js';

@Module({
  controllers: [CmsPublicController, AdminCmsController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}
