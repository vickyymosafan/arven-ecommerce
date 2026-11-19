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
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  CategoryNodeDto,
  CollectionDetailDto,
  CollectionSummaryDto,
  Product3DAssetMetadataDto,
  Product3DAssetPublicDto,
  ProductCardDto,
  ProductDetailDto,
  Telemetry3DReceiptDto,
} from '@arven/contracts';
import {
  productIdOrSlugParamSchema,
  publicProductsQuerySchema,
  record3DTelemetryRequestSchema,
  slugParamSchema,
  uuidSchema,
  type PublicProductsQuery,
  type Record3DTelemetryRequest,
} from '@arven/validators';
import { SkipEnvelope, type PaginatedResponse } from '../../common/http/index.js';
import { Public } from '../../common/security/index.js';
import { Assets3DService } from './assets3d.service.js';
import { CatalogService } from './catalog.service.js';

@ApiTags('Public Catalog')
@Controller()
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalogService: CatalogService,
    @Inject(Assets3DService) private readonly assets3dService: Assets3DService,
  ) {}

  @Get('categories')
  @Public()
  async listCategories(): Promise<CategoryNodeDto[]> {
    return this.catalogService.listPublicCategories();
  }

  @Get('collections')
  @Public()
  async listCollections(): Promise<CollectionSummaryDto[]> {
    return this.catalogService.listPublicCollections();
  }

  @Get('collections/:slug')
  @Public()
  async getCollectionBySlug(
    @Param('slug', { schema: slugParamSchema }) slug: string,
  ): Promise<CollectionDetailDto> {
    return this.catalogService.getPublicCollectionBySlug(slug);
  }

  @Get('products')
  @Public()
  async listProducts(
    @Query({ schema: publicProductsQuerySchema }) query: PublicProductsQuery,
  ): Promise<PaginatedResponse<ProductCardDto>> {
    return this.catalogService.listPublicProducts(query);
  }

  @Get('products/:slug')
  @Public()
  async getProductBySlug(
    @Param('slug', { schema: slugParamSchema }) slug: string,
  ): Promise<ProductDetailDto> {
    return this.catalogService.getPublicProductBySlug(slug);
  }

  @Get('products/:id/3d-assets')
  @Public()
  @ApiOperation({ summary: 'Get active READY 3D product asset manifest and customization presets' })
  async getProduct3DAssets(
    @Param('id', { schema: productIdOrSlugParamSchema }) idOrSlug: string,
  ): Promise<Product3DAssetPublicDto> {
    return this.assets3dService.getPublicProduct3DAssets(idOrSlug);
  }

  @Get('3d-assets/:id/metadata')
  @Public()
  @ApiOperation({ summary: 'Get published 3D asset metadata and quality profiles' })
  async get3DAssetMetadata(
    @Param('id', { schema: uuidSchema }) assetId: string,
  ): Promise<Product3DAssetMetadataDto> {
    return this.assets3dService.getPublic3DAssetMetadata(assetId);
  }

  @Get('3d-assets/:id/model')
  @Public()
  @SkipEnvelope()
  @Header('Content-Type', 'model/gltf-binary')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOperation({ summary: 'Stream validated published default profile GLB binary' })
  async get3DAssetModel(
    @Param('id', { schema: uuidSchema }) assetId: string,
  ): Promise<StreamableFile> {
    const { buffer } = await this.assets3dService.readPublic3DAssetBinary(
      assetId,
      'default',
    );
    return new StreamableFile(buffer);
  }

  @Get('3d-assets/:id/model-lite')
  @Public()
  @SkipEnvelope()
  @Header('Content-Type', 'model/gltf-binary')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOperation({ summary: 'Stream validated published mobile lite profile GLB binary' })
  async get3DAssetLiteModel(
    @Param('id', { schema: uuidSchema }) assetId: string,
  ): Promise<StreamableFile> {
    const { buffer } = await this.assets3dService.readPublic3DAssetBinary(
      assetId,
      'lite',
    );
    return new StreamableFile(buffer);
  }

  @Get('3d-assets/:id/poster')
  @Public()
  @SkipEnvelope()
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({ summary: 'Serve 3D asset fallback poster image' })
  async get3DAssetPoster(
    @Param('id', { schema: uuidSchema }) assetId: string,
    @Res({ passthrough: true }) res: { setHeader(name: string, value: string): void },
  ): Promise<StreamableFile> {
    const { buffer, contentType } =
      await this.assets3dService.readPublic3DAssetBinary(assetId, 'poster');
    res.setHeader('Content-Type', contentType);
    return new StreamableFile(buffer);
  }

  @Post('3d-assets/telemetry')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Record anonymized zero-PII 3D viewer telemetry' })
  async record3DTelemetry(
    @Body({ schema: record3DTelemetryRequestSchema })
    body: Record3DTelemetryRequest,
  ): Promise<Telemetry3DReceiptDto> {
    return this.assets3dService.record3DTelemetry(body);
  }
}
