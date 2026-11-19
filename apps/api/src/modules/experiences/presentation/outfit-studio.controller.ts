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
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  AddOutfitToCartResultDto,
  OutfitStudioCatalogDto,
  ValidateOutfitResultDto,
} from '@arven/contracts';
import {
  addOutfitToCartRequestSchema,
  outfitRigIdParamSchema,
  validateOutfitRequestSchema,
  type AddOutfitToCartRequest,
  type ValidateOutfitRequest,
} from '@arven/validators';
import { SkipEnvelope } from '../../../common/http/index.js';
import {
  Public,
  type HttpRequestLike,
  type HttpResponseLike,
} from '../../../common/security/index.js';
import { OutfitStudioService } from '../application/services/outfit-studio.service.js';

@ApiTags('Outfit Studio')
@Controller('outfit-studio')
export class OutfitStudioController {
  constructor(
    @Inject(OutfitStudioService)
    private readonly outfitStudioService: OutfitStudioService,
  ) {}

  @Get('catalog')
  @Public()
  @ApiOperation({
    summary:
      'Get pinned unisex mannequin rig contract, compatible garments, live variant prices, and public outfit presets',
  })
  async getCatalog(): Promise<OutfitStudioCatalogDto> {
    return this.outfitStudioService.getCatalog();
  }

  @Get('rigs/:rigId/model')
  @Public()
  @SkipEnvelope()
  @Header('Content-Type', 'model/gltf-binary')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOperation({ summary: 'Stream pinned unisex mannequin rig default GLB binary' })
  async getRigModel(
    @Param('rigId', { schema: outfitRigIdParamSchema }) rigId: string,
  ): Promise<StreamableFile> {
    const { buffer } = await this.outfitStudioService.readRigBinary(rigId, 'default');
    return new StreamableFile(buffer);
  }

  @Get('rigs/:rigId/model-lite')
  @Public()
  @SkipEnvelope()
  @Header('Content-Type', 'model/gltf-binary')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOperation({ summary: 'Stream pinned unisex mannequin rig mobile lite GLB binary' })
  async getRigLiteModel(
    @Param('rigId', { schema: outfitRigIdParamSchema }) rigId: string,
  ): Promise<StreamableFile> {
    const { buffer } = await this.outfitStudioService.readRigBinary(rigId, 'lite');
    return new StreamableFile(buffer);
  }

  @Get('rigs/:rigId/poster')
  @Public()
  @SkipEnvelope()
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOperation({ summary: 'Serve mannequin rig fallback poster image' })
  async getRigPoster(
    @Param('rigId', { schema: outfitRigIdParamSchema }) rigId: string,
    @Res({ passthrough: true }) res: { setHeader(name: string, value: string): void },
  ): Promise<StreamableFile> {
    const { buffer, contentType } = await this.outfitStudioService.readRigBinary(
      rigId,
      'poster',
    );
    res.setHeader('Content-Type', contentType);
    return new StreamableFile(buffer);
  }

  @Post('validate')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Statelessly validate rig, slot, anchor, and symmetric layer compatibility for an outfit composition',
  })
  async validateOutfit(
    @Body({ schema: validateOutfitRequestSchema }) body: ValidateOutfitRequest,
  ): Promise<ValidateOutfitResultDto> {
    return this.outfitStudioService.validateOutfitStateless(body);
  }

  @Post('cart-items')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Re-validate outfit compatibility and add compatible, in-stock slots to customer or guest cart with server-authoritative pricing',
  })
  async addOutfitToCart(
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: HttpResponseLike,
    @Body({ schema: addOutfitToCartRequestSchema }) body: AddOutfitToCartRequest,
  ): Promise<AddOutfitToCartResultDto> {
    return this.outfitStudioService.addOutfitToCart(req, res, body);
  }
}
