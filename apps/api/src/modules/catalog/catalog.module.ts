import { Module } from '@nestjs/common';
import { AdminCatalogController } from './admin-catalog.controller.js';
import { Assets3DService } from './assets3d.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';

@Module({
  controllers: [CatalogController, AdminCatalogController],
  providers: [CatalogService, Assets3DService],
  exports: [CatalogService, Assets3DService],
})
export class CatalogModule {}
