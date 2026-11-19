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
  Put,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  AdminCategoryDto,
  AdminCollectionDto,
  AdminProduct3DAssetDto,
  AdminProductDetailDto,
  AdminProductSummaryDto,
  AdminProductVariantDto,
  CustomizationPresetDto,
  Presign3DAssetResponseDto,
  ProductMediaDto,
} from '@arven/contracts';
import {
  adminProductsQuerySchema,
  confirm3DAssetRequestSchema,
  createCategoryRequestSchema,
  createCollectionRequestSchema,
  createCustomizationPresetRequestSchema,
  createProductMediaRequestSchema,
  createProductRequestSchema,
  createProductVariantRequestSchema,
  presign3DAssetRequestSchema,
  publish3DAssetRequestSchema,
  transitionProductStatusRequestSchema,
  updateCategoryRequestSchema,
  updateCollectionRequestSchema,
  updateCustomizationPresetRequestSchema,
  updateProductMediaRequestSchema,
  updateProductRequestSchema,
  updateProductVariantRequestSchema,
  uploadStaging3DAssetRequestSchema,
  uuidSchema,
  type AdminProductsQuery,
  type Confirm3DAssetRequest,
  type CreateCategoryRequest,
  type CreateCollectionRequest,
  type CreateCustomizationPresetRequest,
  type CreateProductMediaRequest,
  type CreateProductRequest,
  type CreateProductVariantRequest,
  type Presign3DAssetRequest,
  type Publish3DAssetRequest,
  type TransitionProductStatusRequest,
  type UpdateCategoryRequest,
  type UpdateCollectionRequest,
  type UpdateCustomizationPresetRequest,
  type UpdateProductMediaRequest,
  type UpdateProductRequest,
  type UpdateProductVariantRequest,
  type UploadStaging3DAssetRequest,
} from '@arven/validators';
import { SkipEnvelope, type PaginatedResponse } from '../../common/http/index.js';
import {
  AdminAuth,
  AuditAction,
  CurrentActor,
  extractClientIp,
  markAuditRecordedInTransaction,
  RequirePermissions,
  type AuthenticatedActor,
} from '../../common/security/index.js';
import { Assets3DService } from './assets3d.service.js';
import { CatalogService } from './catalog.service.js';

type ControllerRequest = Parameters<typeof extractClientIp>[0];

@ApiTags('Admin Catalog')
@Controller('admin')
@AdminAuth()
export class AdminCatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalogService: CatalogService,
    @Inject(Assets3DService) private readonly assets3dService: Assets3DService,
  ) {}

  @Get('products')
  @RequirePermissions('product.read')
  async listProducts(
    @Query({ schema: adminProductsQuerySchema }) query: AdminProductsQuery,
  ): Promise<PaginatedResponse<AdminProductSummaryDto>> {
    return this.catalogService.listAdminProducts(query);
  }

  @Get('products/:id')
  @RequirePermissions('product.read')
  async getProductById(
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<AdminProductDetailDto> {
    return this.catalogService.getAdminProductById(id);
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('product.write')
  @AuditAction('product.created', 'Product')
  async createProduct(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Body({ schema: createProductRequestSchema }) body: CreateProductRequest,
  ): Promise<AdminProductDetailDto> {
    markAuditRecordedInTransaction(req);
    return this.catalogService.createProduct(actor, body, extractClientIp(req));
  }

  @Patch('products/:id')
  @RequirePermissions('product.write')
  @AuditAction('product.updated', 'Product')
  async updateProduct(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateProductRequestSchema }) body: UpdateProductRequest,
  ): Promise<AdminProductDetailDto> {
    markAuditRecordedInTransaction(req);
    return this.catalogService.updateProduct(actor, id, body, extractClientIp(req));
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('product.write')
  @AuditAction('product.deleted', 'Product')
  async deleteProduct(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.catalogService.deleteProduct(actor, id, extractClientIp(req));
  }

  @Post('products/:id/transition')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('product.publish')
  @AuditAction('product.status.transitioned', 'Product')
  async transitionProductStatus(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: transitionProductStatusRequestSchema })
    body: TransitionProductStatusRequest,
  ): Promise<AdminProductDetailDto> {
    markAuditRecordedInTransaction(req);
    return this.catalogService.transitionProductStatus(
      actor,
      id,
      body,
      extractClientIp(req),
    );
  }

  @Post('products/:id/variants')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('product.write')
  @AuditAction('product.variant.created', 'ProductVariant')
  async createVariant(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: createProductVariantRequestSchema })
    body: CreateProductVariantRequest,
  ): Promise<AdminProductVariantDto> {
    markAuditRecordedInTransaction(req);
    return this.catalogService.createVariant(actor, id, body, extractClientIp(req));
  }

  @Patch('products/:id/variants/:variantId')
  @RequirePermissions('product.write')
  @AuditAction('product.variant.updated', 'ProductVariant')
  async updateVariant(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Param('variantId', { schema: uuidSchema }) variantId: string,
    @Body({ schema: updateProductVariantRequestSchema })
    body: UpdateProductVariantRequest,
  ): Promise<AdminProductVariantDto> {
    markAuditRecordedInTransaction(req);
    return this.catalogService.updateVariant(
      actor,
      id,
      variantId,
      body,
      extractClientIp(req),
    );
  }

  @Delete('products/:id/variants/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('product.write')
  @AuditAction('product.variant.deleted', 'ProductVariant')
  async deleteVariant(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Param('variantId', { schema: uuidSchema }) variantId: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.catalogService.deleteVariant(actor, id, variantId, extractClientIp(req));
  }

  @Post('products/:id/media')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('product.write')
  @AuditAction('product.media.created', 'ProductMedia')
  async createMedia(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: createProductMediaRequestSchema }) body: CreateProductMediaRequest,
  ): Promise<ProductMediaDto> {
    markAuditRecordedInTransaction(req);
    return this.catalogService.createMedia(actor, id, body, extractClientIp(req));
  }

  @Patch('products/:id/media/:mediaId')
  @RequirePermissions('product.write')
  @AuditAction('product.media.updated', 'ProductMedia')
  async updateMedia(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Param('mediaId', { schema: uuidSchema }) mediaId: string,
    @Body({ schema: updateProductMediaRequestSchema }) body: UpdateProductMediaRequest,
  ): Promise<ProductMediaDto> {
    markAuditRecordedInTransaction(req);
    return this.catalogService.updateMedia(actor, id, mediaId, body, extractClientIp(req));
  }

  @Delete('products/:id/media/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('product.write')
  @AuditAction('product.media.deleted', 'ProductMedia')
  async deleteMedia(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Param('mediaId', { schema: uuidSchema }) mediaId: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.catalogService.deleteMedia(actor, id, mediaId, extractClientIp(req));
  }

  @Get('categories')
  @RequirePermissions('product.read')
  async listCategories(): Promise<AdminCategoryDto[]> {
    return this.catalogService.listAdminCategories();
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('product.write')
  @AuditAction('category.created', 'Category')
  async createCategory(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Body({ schema: createCategoryRequestSchema }) body: CreateCategoryRequest,
  ): Promise<AdminCategoryDto> {
    markAuditRecordedInTransaction(req);
    return this.catalogService.createCategory(actor, body, extractClientIp(req));
  }

  @Patch('categories/:id')
  @RequirePermissions('product.write')
  @AuditAction('category.updated', 'Category')
  async updateCategory(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateCategoryRequestSchema }) body: UpdateCategoryRequest,
  ): Promise<AdminCategoryDto> {
    markAuditRecordedInTransaction(req);
    return this.catalogService.updateCategory(actor, id, body, extractClientIp(req));
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('product.write')
  @AuditAction('category.deleted', 'Category')
  async deleteCategory(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.catalogService.deleteCategory(actor, id, extractClientIp(req));
  }

  @Get('collections')
  @RequirePermissions('product.read')
  async listCollections(): Promise<AdminCollectionDto[]> {
    return this.catalogService.listAdminCollections();
  }

  @Post('collections')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('product.write')
  @AuditAction('collection.created', 'Collection')
  async createCollection(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Body({ schema: createCollectionRequestSchema }) body: CreateCollectionRequest,
  ): Promise<AdminCollectionDto> {
    markAuditRecordedInTransaction(req);
    return this.catalogService.createCollection(actor, body, extractClientIp(req));
  }

  @Patch('collections/:id')
  @RequirePermissions('product.write')
  @AuditAction('collection.updated', 'Collection')
  async updateCollection(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateCollectionRequestSchema }) body: UpdateCollectionRequest,
  ): Promise<AdminCollectionDto> {
    markAuditRecordedInTransaction(req);
    return this.catalogService.updateCollection(actor, id, body, extractClientIp(req));
  }

  @Delete('collections/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('product.write')
  @AuditAction('collection.deleted', 'Collection')
  async deleteCollection(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.catalogService.deleteCollection(actor, id, extractClientIp(req));
  }

  // ===========================================================================
  // Phase 07: Admin 3D Asset Quarantine Upload, Validation, Preview & Presets
  // ===========================================================================

  @Get('products/:id/3d-assets')
  @RequirePermissions('asset.read')
  async listProduct3DAssets(
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<AdminProduct3DAssetDto[]> {
    return this.assets3dService.listAdminProduct3DAssets(id);
  }

  @Post('products/:id/3d-assets/presign')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('asset.upload')
  @AuditAction('asset3d.presigned', 'Product3DAsset')
  async presign3DAssetUpload(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: presign3DAssetRequestSchema }) body: Presign3DAssetRequest,
  ): Promise<Presign3DAssetResponseDto> {
    markAuditRecordedInTransaction(req);
    return this.assets3dService.presignAdmin3DAssetUpload(
      actor,
      id,
      body,
      extractClientIp(req),
    );
  }

  @Put('3d-assets/:id/upload-staging')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('asset.upload')
  @AuditAction('asset3d.staged', 'Product3DAsset')
  async uploadStaging3DAsset(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) assetId: string,
    @Body({ schema: uploadStaging3DAssetRequestSchema })
    body: UploadStaging3DAssetRequest,
  ): Promise<AdminProduct3DAssetDto> {
    markAuditRecordedInTransaction(req);
    return this.assets3dService.uploadStagingBytes(
      actor,
      assetId,
      body,
      extractClientIp(req),
    );
  }

  @Post('products/:id/3d-assets/:assetId/confirm')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('asset.upload')
  @AuditAction('asset3d.validated', 'Product3DAsset')
  async confirmProduct3DAsset(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) productId: string,
    @Param('assetId', { schema: uuidSchema }) assetId: string,
    @Body({ schema: confirm3DAssetRequestSchema }) body: Confirm3DAssetRequest,
  ): Promise<AdminProduct3DAssetDto> {
    markAuditRecordedInTransaction(req);
    return this.assets3dService.confirmAdmin3DAssetUpload(
      actor,
      assetId,
      body,
      extractClientIp(req),
      productId,
    );
  }

  @Post('3d-assets/:id/confirm')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('asset.upload')
  @AuditAction('asset3d.validated', 'Product3DAsset')
  async confirm3DAsset(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) assetId: string,
    @Body({ schema: confirm3DAssetRequestSchema }) body: Confirm3DAssetRequest,
  ): Promise<AdminProduct3DAssetDto> {
    markAuditRecordedInTransaction(req);
    return this.assets3dService.confirmAdmin3DAssetUpload(
      actor,
      assetId,
      body,
      extractClientIp(req),
    );
  }

  @Get('3d-assets/:id/preview-model')
  @SkipEnvelope()
  @RequirePermissions('asset.read')
  @Header('Content-Type', 'model/gltf-binary')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  async previewAdmin3DAsset(
    @Param('id', { schema: uuidSchema }) assetId: string,
  ): Promise<StreamableFile> {
    const buf = await this.assets3dService.readAdminPreviewModelBinary(assetId);
    return new StreamableFile(buf);
  }

  @Post('3d-assets/:id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('asset.publish')
  @AuditAction('asset3d.published', 'Product3DAsset')
  async publish3DAsset(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) assetId: string,
    @Body({ schema: publish3DAssetRequestSchema }) body: Publish3DAssetRequest,
  ): Promise<AdminProduct3DAssetDto> {
    markAuditRecordedInTransaction(req);
    return this.assets3dService.publishAdmin3DAsset(
      actor,
      assetId,
      body,
      extractClientIp(req),
    );
  }

  @Get('3d-assets/:id/presets')
  @RequirePermissions('asset.read')
  async list3DAssetPresets(
    @Param('id', { schema: uuidSchema }) assetId: string,
  ): Promise<CustomizationPresetDto[]> {
    return this.assets3dService.listAssetPresets(assetId);
  }

  @Post('3d-assets/:id/presets')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('asset.upload')
  @AuditAction('asset3d.preset.created', 'CustomizationPreset')
  async create3DAssetPreset(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) assetId: string,
    @Body({ schema: createCustomizationPresetRequestSchema })
    body: CreateCustomizationPresetRequest,
  ): Promise<CustomizationPresetDto> {
    markAuditRecordedInTransaction(req);
    return this.assets3dService.createAssetPreset(
      actor,
      assetId,
      body,
      extractClientIp(req),
    );
  }

  @Patch('3d-assets/:id/presets/:presetId')
  @RequirePermissions('asset.upload')
  @AuditAction('asset3d.preset.updated', 'CustomizationPreset')
  async update3DAssetPreset(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) assetId: string,
    @Param('presetId', { schema: uuidSchema }) presetId: string,
    @Body({ schema: updateCustomizationPresetRequestSchema })
    body: UpdateCustomizationPresetRequest,
  ): Promise<CustomizationPresetDto> {
    markAuditRecordedInTransaction(req);
    return this.assets3dService.updateAssetPreset(
      actor,
      assetId,
      presetId,
      body,
      extractClientIp(req),
    );
  }

  @Delete('3d-assets/:id/presets/:presetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('asset.upload')
  @AuditAction('asset3d.preset.deleted', 'CustomizationPreset')
  async delete3DAssetPreset(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) assetId: string,
    @Param('presetId', { schema: uuidSchema }) presetId: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.assets3dService.deleteAssetPreset(
      actor,
      assetId,
      presetId,
      extractClientIp(req),
    );
  }
}
