import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  AdminCategoryDto,
  AdminCollectionDto,
  AdminProductDetailDto,
  AdminProductSummaryDto,
  AdminProductVariantDto,
  ProductMediaDto,
} from '@arven/contracts';
import {
  adminProductsQuerySchema,
  createCategoryRequestSchema,
  createCollectionRequestSchema,
  createProductMediaRequestSchema,
  createProductRequestSchema,
  createProductVariantRequestSchema,
  transitionProductStatusRequestSchema,
  updateCategoryRequestSchema,
  updateCollectionRequestSchema,
  updateProductMediaRequestSchema,
  updateProductRequestSchema,
  updateProductVariantRequestSchema,
  uuidSchema,
  type AdminProductsQuery,
  type CreateCategoryRequest,
  type CreateCollectionRequest,
  type CreateProductMediaRequest,
  type CreateProductRequest,
  type CreateProductVariantRequest,
  type TransitionProductStatusRequest,
  type UpdateCategoryRequest,
  type UpdateCollectionRequest,
  type UpdateProductMediaRequest,
  type UpdateProductRequest,
  type UpdateProductVariantRequest,
} from '@arven/validators';
import type { PaginatedResponse } from '../../common/http/index.js';
import {
  AdminAuth,
  AuditAction,
  CurrentActor,
  extractClientIp,
  markAuditRecordedInTransaction,
  RequirePermissions,
  type AuthenticatedActor,
} from '../../common/security/index.js';
import { CatalogService } from './catalog.service.js';

type ControllerRequest = Parameters<typeof extractClientIp>[0];

@ApiTags('Admin Catalog')
@Controller('admin')
@AdminAuth()
export class AdminCatalogController {
  constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {}

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
}
