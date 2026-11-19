import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { OutfitSceneDto } from '@arven/contracts';
import {
  createOutfitSceneRequestSchema,
  updateOutfitSceneRequestSchema,
  uuidSchema,
  type CreateOutfitSceneRequest,
  type UpdateOutfitSceneRequest,
} from '@arven/validators';
import {
  CurrentActor,
  CustomerAuth,
  type AuthenticatedActor,
} from '../../../common/security/index.js';
import { OutfitStudioService } from '../application/services/outfit-studio.service.js';

@ApiTags('Customer Outfits')
@Controller('outfit-scenes')
@CustomerAuth()
export class OutfitScenesController {
  constructor(
    @Inject(OutfitStudioService)
    private readonly outfitStudioService: OutfitStudioService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'List authenticated customer saved outfits hydrated with live variant IDR pricing and stale indicators',
  })
  async listCustomerOutfits(
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<OutfitSceneDto[]> {
    return this.outfitStudioService.listCustomerOutfits(actor);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get a single saved outfit owned by the authenticated customer',
  })
  async getCustomerOutfit(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<OutfitSceneDto> {
    return this.outfitStudioService.getCustomerOutfit(actor, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Create a customer saved outfit (max 50 per user; persists IDs/presets only after compatibility validation)',
  })
  async createCustomerOutfit(
    @CurrentActor() actor: AuthenticatedActor,
    @Body({ schema: createOutfitSceneRequestSchema }) body: CreateOutfitSceneRequest,
  ): Promise<OutfitSceneDto> {
    return this.outfitStudioService.createCustomerOutfit(actor, body);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Update a customer saved outfit title, rig, or slots with full compatibility validation',
  })
  async updateCustomerOutfit(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateOutfitSceneRequestSchema }) body: UpdateOutfitSceneRequest,
  ): Promise<OutfitSceneDto> {
    return this.outfitStudioService.updateCustomerOutfit(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Delete a customer saved outfit' })
  async deleteCustomerOutfit(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<void> {
    await this.outfitStudioService.deleteCustomerOutfit(actor, id);
  }
}
