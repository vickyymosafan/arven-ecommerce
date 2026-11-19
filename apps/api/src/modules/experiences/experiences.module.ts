import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module.js';
import { OutfitStudioService } from './application/services/outfit-studio.service.js';
import { ShowroomService } from './application/services/showroom.service.js';
import {
  OUTFIT_STUDIO_REPOSITORY,
  SHOWROOM_REPOSITORY,
} from './domain/ports/experiences.ports.js';
import { PrismaOutfitStudioRepository } from './infrastructure/repositories/prisma-outfit-studio.repository.js';
import { PrismaShowroomRepository } from './infrastructure/repositories/prisma-showroom.repository.js';
import { AdminExperiencesController } from './presentation/admin-experiences.controller.js';
import { OutfitScenesController } from './presentation/outfit-scenes.controller.js';
import { OutfitStudioController } from './presentation/outfit-studio.controller.js';
import { ShowroomController } from './presentation/showroom.controller.js';

@Module({
  imports: [CartModule],
  controllers: [
    ShowroomController,
    OutfitStudioController,
    OutfitScenesController,
    AdminExperiencesController,
  ],
  providers: [
    PrismaShowroomRepository,
    PrismaOutfitStudioRepository,
    {
      provide: SHOWROOM_REPOSITORY,
      useExisting: PrismaShowroomRepository,
    },
    {
      provide: OUTFIT_STUDIO_REPOSITORY,
      useExisting: PrismaOutfitStudioRepository,
    },
    ShowroomService,
    OutfitStudioService,
  ],
  exports: [ShowroomService, OutfitStudioService],
})
export class ExperiencesModule {}
