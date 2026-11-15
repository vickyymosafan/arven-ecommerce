import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  CategoryNodeDto,
  CollectionDetailDto,
  CollectionSummaryDto,
  ProductCardDto,
  ProductDetailDto,
} from '@arven/contracts';
import {
  publicProductsQuerySchema,
  slugParamSchema,
  type PublicProductsQuery,
} from '@arven/validators';
import type { PaginatedResponse } from '../../common/http/index.js';
import { Public } from '../../common/security/index.js';
import { CatalogService } from './catalog.service.js';

@ApiTags('Public Catalog')
@Controller()
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {}

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
}
